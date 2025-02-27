import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { EndpointList, EndpointListItem } from "../shared/api.ts";
import axios from "axios-web";

interface LocalMutation {
  setting: string | null;
  name: string | null;
  endpoint: string | null;
  apiKey: string | null;
  models: string[] | null;
  enabled: boolean;
}

export default function EndpointListView(
  props: { initialData: EndpointList; latency: number },
) {
  const [data, setData] = useState(props.initialData);
  const [dirty, setDirty] = useState(false);
  const localMutations = useRef(new Map<string, LocalMutation>());
  const [hasLocalMutations, setHasLocalMutations] = useState(false);
  const busy = hasLocalMutations || dirty;
  const [adding, setAdding] = useState(false);

  const baseUrlInput = useRef<HTMLInputElement>(null);
  const apiKeyInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const base = url.origin;
    const key = url.pathname.slice(1);

    baseUrlInput.current!.value = `${base}/api`;
    apiKeyInput.current!.value = key;

    let es = new EventSource(window.location.href);

    es.addEventListener("message", (e) => {
      const newData: EndpointList = JSON.parse(e.data);
      setData(newData);
      setDirty(false);
      setAdding(false);
    });

    es.addEventListener("error", async () => {
      es.close();
      const backoff = 10000 + Math.random() * 5000;
      await new Promise((resolve) => setTimeout(resolve, backoff));
      es = new EventSource(window.location.href);
    });
  }, []);

  useEffect(() => {
    (async () => {
      while (1) {
        const mutations = Array.from(localMutations.current);
        localMutations.current = new Map();
        setHasLocalMutations(false);

        if (mutations.length) {
          setDirty(true);
          const chunkSize = 10;
          for (let i = 0; i < mutations.length; i += chunkSize) {
            const chunk = mutations.slice(i, i + chunkSize).map((
              [id, mut],
            ) => ({
              id,
              setting: mut.setting,
              name: mut.name,
              endpoint: mut.endpoint,
              apiKey: mut.apiKey,
              models: mut.models,
              enabled: mut.enabled,
            }));
            while (true) {
              try {
                await axios.post(window.location.href, chunk);
                break;
              } catch {
                await new Promise((resolve) => setTimeout(resolve, 1000));
              }
            }
          }
        }

        await new Promise((resolve) =>
          setTimeout(
            () => requestAnimationFrame(resolve), // pause when the page is hidden
            1000,
          )
        );
      }
    })();
  }, []);

  const addEndpointInput = useRef<HTMLInputElement>(null);
  const addEndpoint = useCallback(() => {
    const value = addEndpointInput.current!.value;
    if (!value) return;
    addEndpointInput.current!.value = "";

    const setting = value;
    const [name, endpoint, apiKey] = value.split("|", 3);

    const id = generateItemId();
    localMutations.current.set(id, {
      setting,
      name,
      endpoint,
      apiKey,
      models: [],
      enabled: true,
    });
    setHasLocalMutations(true);
    setAdding(true);
  }, []);

  const saveEndpoint = useCallback(
    (
      item: EndpointListItem,
      setting: string | null,
      models: string[] | null,
      enabled: boolean,
    ) => {
      if (!setting) {
        localMutations.current.set(item.id!, {
          setting: "",
          name: "",
          endpoint: "",
          apiKey: "",
          models: [],
          enabled,
        });
      } else {
        const [name, endpoint, apiKey] = setting.split("|", 3);
        localMutations.current.set(item.id!, {
          setting,
          name,
          endpoint,
          apiKey,
          models,
          enabled,
        });
      }
      setHasLocalMutations(true);
    },
    [],
  );

  return (
    <div className="flex gap-2 w-full items-center justify-center py-4 xl:py-16 px-2">
      <div className="rounded w-full xl:max-w-xl">
        <div className="flex flex-col gap-4 pb-4">
          <div className="flex flex-row gap-2 items-center">
            <h1 className="font-bold text-xl">Doroseek</h1>
            <div
              className={`inline-block h-2 w-2 ${
                busy ? "bg-yellow-600" : "bg-green-600"
              }`}
              style={{ borderRadius: "50%" }}
            >
            </div>
          </div>
          <div className="flex">
            <p className="opacity-50 text-sm">
              Save this page to avoid losing your setting. Share this page to
              collaborate with others.
            </p>
          </div>
          <div className="flex">
            <div className="flex items-center text-md w-24">Base URL</div>
            <input
              className="text-black border rounded w-full py-1 px-3"
              ref={baseUrlInput}
              onClick={() => baseUrlInput.current?.select()}
              readonly
            />
          </div>
          <div className="flex">
            <div className="flex items-center text-md w-24">API Key</div>
            <input
              className="text-black border rounded w-full py-1 px-3"
              ref={apiKeyInput}
              onClick={() => apiKeyInput.current?.select()}
              readonly
            />
          </div>
          <div className="flex flex-row gap-2 items-center">
            <h2 className="font-bold text-lg">Endpoints</h2>
          </div>
          <div className="flex">
            <input
              className="text-black border rounded w-full py-2 px-3 mr-4"
              placeholder="Add an endpoint (name|endpoint|apikey)"
              ref={addEndpointInput}
            />
            <button
              className="p-2 bg-blue-600 text-white rounded disabled:opacity-50"
              onClick={addEndpoint}
              disabled={adding}
            >
              Add
            </button>
          </div>
          <div className="flex">
            <p className="opacity-50 text-sm">
              Endpoint format: name|endpoint|apikey
            </p>
          </div>
        </div>
        <div>
          {data.items.map((item) => (
            <EndpointItem
              key={item.id! + ":" + item.versionstamp!}
              item={item}
              save={saveEndpoint}
            />
          ))}
        </div>
        <div className="pt-6 opacity-50 text-sm">
          <p>
            Initial data fetched in {props.latency}ms
          </p>
          <p>
            <a
              href="https://github.com/junjiepro/Doroseek"
              className="underline"
            >
              Source code
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

function EndpointItem(
  { item, save }: {
    item: EndpointListItem;
    save: (
      item: EndpointListItem,
      setting: string | null,
      models: string[] | null,
      enabled: boolean,
    ) => void;
  },
) {
  const input = useRef<HTMLInputElement>(null);
  const modelsInput = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [editingModels, setEditingModels] = useState(false);
  const [busy, setBusy] = useState(false);
  const doSave = useCallback(() => {
    if (!input.current) return;
    setBusy(true);
    save(item, input.current.value, item.models, item.enabled);
  }, [item]);
  const cancelEdit = useCallback(() => {
    if (!input.current) return;
    setEditing(false);
    input.current.value = item.setting;
  }, []);
  const cancelEditModels = useCallback(() => {
    if (!modelsInput.current) return;
    setEditingModels(false);
    modelsInput.current.value = item.models?.join(",");
  }, []);
  const doDelete = useCallback(() => {
    const yes = confirm("Are you sure you want to delete this item?");
    if (!yes) return;
    setBusy(true);
    save(item, null, item.models, item.enabled);
  }, [item]);
  const doSaveEnabled = useCallback((enabled: boolean) => {
    setBusy(true);
    save(item, item.setting, item.models, enabled);
  }, [item]);
  const doSaveModels = useCallback(() => {
    if (!modelsInput.current) return;
    setBusy(true);
    // 去重
    const models = Array.from(
      new Set(
        modelsInput.current.value.replaceAll("，", ",").split(",").map((m) =>
          m.trim()
        ),
      ),
    );
    save(item, item.setting, models, item.enabled);
  }, [item]);

  const modelNames = item.models?.map((m) => m.split("@")[0]) || [];

  return (
    <div
      className="flex my-2 border-b border-gray-300 items-center min-h-16"
      {...{ "data-item-id": item.id! }}
    >
      {editing && (
        <>
          <input
            className="border rounded w-full py-2 px-3 mr-4"
            ref={input}
            defaultValue={item.setting}
          />
          <button
            className="p-2 rounded mr-2 disabled:opacity-50"
            title="Save"
            onClick={doSave}
            disabled={busy}
          >
            💾
          </button>
          <button
            className="p-2 rounded disabled:opacity-50"
            title="Cancel"
            onClick={cancelEdit}
            disabled={busy}
          >
            🚫
          </button>
        </>
      )}
      {editingModels && (
        <>
          <input
            className="border rounded w-full py-2 px-3 mr-4"
            ref={modelsInput}
            defaultValue={item.models?.join(",")}
            placeholder="alias1:model1,alias2:model2"
          />
          <button
            className="p-2 rounded mr-2 disabled:opacity-50"
            title="Save"
            onClick={doSaveModels}
            disabled={busy}
          >
            💾
          </button>
          <button
            className="p-2 rounded disabled:opacity-50"
            title="Cancel"
            onClick={cancelEditModels}
            disabled={busy}
          >
            🚫
          </button>
        </>
      )}
      {!editing && !editingModels && (
        <>
          <input
            type="checkbox"
            checked={item.enabled}
            disabled={busy}
            onChange={(e) => doSaveEnabled(e.currentTarget.checked)}
            className="mr-2"
          />
          <div className="flex flex-col w-full font-mono">
            <p>
              {item.name}
            </p>
            {modelNames.length > 0 && (
              <p className="text-xs opacity-50 leading-loose">
                {modelNames.map((name) => (
                  <div key={name} className="inline-block mr-2">
                    <button
                      type="button"
                      className="border rounded px-1 text-xs opacity-50 hover:opacity-100 data-[state=copied]:bg-green-500 data-[state=copied]:opacity-100 data-[state=copied]:text-white"
                      data-state="false"
                      onClick={(event) => {
                        navigator.clipboard.writeText(name);
                        const button = event.currentTarget as HTMLButtonElement;
                        button.dataset.state = "copied";
                        button.textContent = name + "✅";
                        setTimeout(() => {
                          button.dataset.state = "false";
                          button.textContent = name;
                        }, 2500);
                      }}
                    >
                      {name}
                    </button>
                  </div>
                ))}
              </p>
            )}
            <p className="text-xs opacity-50 leading-loose">
              {new Date(item.createdAt).toISOString()}
            </p>
          </div>
          <button
            className="p-2 mr-2 disabled:opacity-50"
            title="Edit"
            onClick={() => setEditing(true)}
            disabled={busy}
          >
            ✏️
          </button>
          <button
            className="p-2 mr-2 disabled:opacity-50"
            title="Edit models"
            onClick={() => setEditingModels(true)}
            disabled={busy}
          >
            🗂️
          </button>
          <button
            className="p-2 disabled:opacity-50"
            title="Delete"
            onClick={doDelete}
            disabled={busy}
          >
            🗑️
          </button>
        </>
      )}
    </div>
  );
}

function generateItemId(): string {
  return `${Date.now()}-${crypto.randomUUID()}`;
}
