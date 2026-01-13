import { Button } from "@opencode-ai/ui/button"
import { Dialog } from "@opencode-ai/ui/dialog"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Icon } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import { createSignal, For, Show, onMount } from "solid-js"
import { invoke } from "@tauri-apps/api/core"

export interface McpConfig {
  type: "local" | "remote"
  name: string
  command?: string[]
  url?: string
  enabled?: boolean
  headers?: Record<string, string>
}

function DialogManageMcp() {
  const [name, setName] = createSignal("")
  const [command, setCommand] = createSignal("")
  const [args, setArgs] = createSignal("")
  const [url, setUrl] = createSignal("")
  const [showAddForm, setShowAddForm] = createSignal(false)
  const [mcpType, setMcpType] = createSignal<"local" | "remote">("local")
  const [inputMode, setInputMode] = createSignal<"form" | "json">("form")
  const [jsonInput, setJsonInput] = createSignal("")
  const [configs, setConfigs] = createSignal<McpConfig[]>([])
  const [isLoading, setIsLoading] = createSignal(false)
  const [editingId, setEditingId] = createSignal<string | null>(null)

  // Load configs from file on mount
  onMount(async () => {
    setIsLoading(true)
    try {
      const result = await invoke<McpConfig[]>("read_mcp_configs")
      setConfigs(result)
    } catch (error) {
      console.error("Failed to load MCP configs:", error)
    }
    setIsLoading(false)
  })

  const saveConfigs = async (newConfigs: McpConfig[]) => {
    try {
      await invoke("write_mcp_configs", { configs: newConfigs })
      setConfigs(newConfigs)
    } catch (error) {
      showToast({
        title: "Failed to save",
        description: String(error),
        variant: "error",
      })
    }
  }

  const handleEdit = (config: McpConfig) => {
    setEditingId(config.name)
    setInputMode("form")
    setMcpType(config.type)
    setName(config.name)
    if (config.type === "local") {
      setCommand(config.command?.[0] || "")
      setArgs(config.command?.slice(1).join(" ") || "")
    } else {
      setUrl(config.url || "")
    }
    setShowAddForm(true)
  }

  const handleAddOrUpdate = async () => {
    let newConfig: McpConfig
    let configName: string

    if (inputMode() === "json") {
      // JSON mode: parse config
      try {
        let parsed = JSON.parse(jsonInput())
        let configData: any

        // Check if it's the format with key as outer property
        const keys = Object.keys(parsed)
        if (keys.length === 1 && typeof parsed[keys[0]] === 'object' && parsed[keys[0]].type) {
          configName = keys[0]
          configData = parsed[keys[0]]
        } else {
          configData = parsed
          configName = editingId() || (name().trim() || "mcp-" + Date.now())
        }

        if (!configData.type) {
          showToast({
            title: "Validation Error",
            description: "Type is required (local or remote)",
            variant: "error",
          })
          return
        }
        if (configData.type === "local" && !configData.command) {
          showToast({
            title: "Validation Error",
            description: "Command is required for local type",
            variant: "error",
          })
          return
        }
        if (configData.type === "remote" && !configData.url) {
          showToast({
            title: "Validation Error",
            description: "URL is required for remote type",
            variant: "error",
          })
          return
        }

        newConfig = {
          name: configName,
          ...configData,
        }
      } catch (e: any) {
        showToast({
          title: "Invalid JSON",
          description: e.message || "Please enter valid JSON",
          variant: "error",
        })
        return
      }
    } else {
      // Form mode
      configName = editingId() || (name().trim() || "mcp-" + Date.now())

      if (mcpType() === "local") {
        const trimmedCommand = command().trim()
        if (!trimmedCommand) {
          showToast({
            title: "Validation Error",
            description: "Command is required",
            variant: "error",
          })
          return
        }

        const commandArr = [trimmedCommand]
        const trimmedArgs = args().trim()
        if (trimmedArgs) {
          commandArr.push(...trimmedArgs.split(/\s+/).filter(Boolean))
        }

        newConfig = {
          name: configName,
          type: "local",
          command: commandArr,
        }
      } else {
        const trimmedUrl = url().trim()
        if (!trimmedUrl) {
          showToast({
            title: "Validation Error",
            description: "URL is required for remote type",
            variant: "error",
          })
          return
        }

        newConfig = {
          name: configName,
          type: "remote",
          url: trimmedUrl,
          enabled: true,
        }
      }
    }

    const isEditing = editingId() !== null
    const newConfigs = isEditing
      ? configs().map((c) => c.name === editingId() ? newConfig : c)
      : [...configs(), newConfig]

    await saveConfigs(newConfigs)
    resetForm()
    setShowAddForm(false)

    showToast({
      title: isEditing ? "MCP Updated" : "MCP Added",
      description: `${configName} ${isEditing ? "updated" : "added"}`,
    })
  }

  const resetForm = () => {
    setName("")
    setCommand("")
    setArgs("")
    setUrl("")
    setJsonInput("")
    setEditingId(null)
  }

  const handleCancelEdit = () => {
    resetForm()
    setShowAddForm(false)
  }

  const handleDelete = async (name: string) => {
    await saveConfigs(configs().filter((c) => c.name !== name))
    showToast({
      title: "MCP Removed",
      description: `${name} has been removed`,
    })
  }

  return (
    <Dialog title="Manage MCPs" description="Add and remove MCP servers">
      <div class="flex flex-col gap-3 px-3">
        <Button
          onClick={() => {
            setShowAddForm(!showAddForm())
            setInputMode("form")
            setMcpType("local")
            if (!showAddForm()) resetForm()
          }}
          icon="plus"
          variant={showAddForm() ? "ghost" : "primary"}
          class="w-full"
        >
          {showAddForm() ? "Cancel" : "Add MCP"}
        </Button>

        <Show when={showAddForm()}>
          <div class="flex flex-col gap-3 p-3 bg-surface-raised-base rounded-lg border border-border-weak-base">
            {/* Mode toggle */}
            <div class="flex gap-1 p-1 bg-background-base rounded-md">
              <button
                onClick={() => setInputMode("form")}
                classList={{
                  "flex-1 px-2 py-1 text-12-medium rounded transition-colors": true,
                  "bg-surface-raised-base-hover text-text-strong": inputMode() === "form",
                  "text-text-weak": inputMode() !== "form",
                }}
              >
                Form
              </button>
              <button
                onClick={() => setInputMode("json")}
                classList={{
                  "flex-1 px-2 py-1 text-12-medium rounded transition-colors": true,
                  "bg-surface-raised-base-hover text-text-strong": inputMode() === "json",
                  "text-text-weak": inputMode() !== "json",
                }}
              >
                JSON
              </button>
            </div>

            <Show when={editingId()}>
              <div class="text-12-medium text-text-subtle">
                Editing: <span class="text-text-strong">{editingId()}</span>
              </div>
            </Show>

            <Show when={inputMode() === "form"}>
              <div class="flex flex-col gap-3">
                {/* Type toggle */}
                <div class="flex gap-1 p-1 bg-background-base rounded-md">
                  <button
                    onClick={() => setMcpType("local")}
                    classList={{
                      "flex-1 px-2 py-1 text-12-medium rounded transition-colors": true,
                      "bg-surface-raised-base-hover text-text-strong": mcpType() === "local",
                      "text-text-weak": mcpType() !== "local",
                    }}
                  >
                    Local
                  </button>
                  <button
                    onClick={() => setMcpType("remote")}
                    classList={{
                      "flex-1 px-2 py-1 text-12-medium rounded transition-colors": true,
                      "bg-surface-raised-base-hover text-text-strong": mcpType() === "remote",
                      "text-text-weak": mcpType() !== "remote",
                    }}
                  >
                    Remote
                  </button>
                </div>

                <Show when={mcpType() === "local"}>
                  <div class="flex flex-col gap-1.5">
                    <label class="text-12-medium text-text-strong">Command</label>
                    <input
                      type="text"
                      placeholder="e.g. npx"
                      value={command()}
                      onInput={(e) => setCommand(e.currentTarget.value)}
                      class="w-full px-2 py-1.5 text-14 bg-background-base border border-border-weak-base rounded-md focus:outline-none focus:ring-2 focus:ring-border-strong-base"
                    />
                  </div>

                  <div class="flex flex-col gap-1.5">
                    <label class="text-12-medium text-text-strong">Args (optional, space-separated)</label>
                    <input
                      type="text"
                      placeholder="e.g. -y @modelcontextprotocol/server-filesystem"
                      value={args()}
                      onInput={(e) => setArgs(e.currentTarget.value)}
                      class="w-full px-2 py-1.5 text-14 bg-background-base border border-border-weak-base rounded-md focus:outline-none focus:ring-2 focus:ring-border-strong-base"
                    />
                  </div>
                </Show>

                <Show when={mcpType() === "remote"}>
                  <div class="flex flex-col gap-1.5">
                    <label class="text-12-medium text-text-strong">URL</label>
                    <input
                      type="text"
                      placeholder="e.g. https://my-mcp-server.com"
                      value={url()}
                      onInput={(e) => setUrl(e.currentTarget.value)}
                      class="w-full px-2 py-1.5 text-14 bg-background-base border border-border-weak-base rounded-md focus:outline-none focus:ring-2 focus:ring-border-strong-base"
                    />
                  </div>
                </Show>

                <Button onClick={handleAddOrUpdate} variant="primary" class="w-full">
                  {editingId() ? "Update" : "Add"}
                </Button>
              </div>
            </Show>

            <Show when={inputMode() === "json"}>
              <div class="flex flex-col gap-3">
                <div class="flex flex-col gap-1.5">
                  <label class="text-12-medium text-text-strong">JSON Configuration</label>
                  <textarea
                    placeholder='{"my-mcp": {"type": "local", "command": ["npx", "-y", "@server/package"]}}'
                    value={jsonInput()}
                    onInput={(e) => setJsonInput(e.currentTarget.value)}
                    rows={8}
                    class="w-full px-2 py-1.5 text-14 bg-background-base border border-border-weak-base rounded-md focus:outline-none focus:ring-2 focus:ring-border-strong-base resize-none font-mono"
                  />
                  <span class="text-11-regular text-text-weaker">
                    Supports both formats: with key (e.g. {`{"my-mcp": {...}}`}) or without key (e.g. {`{"type": "local", ...}`})
                  </span>
                </div>

                <Button onClick={handleAddOrUpdate} variant="primary" class="w-full">
                  {editingId() ? "Update" : "Add"}
                </Button>
              </div>
            </Show>
          </div>
        </Show>

        <Show when={isLoading()}>
          <div class="text-center py-8 text-text-weaker text-14">
            Loading...
          </div>
        </Show>

        <Show when={!isLoading() && configs().length > 0}>
          <div class="flex flex-col gap-1">
            <For each={configs()}>
              {(config) => (
                <div class="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-surface-raised-base-hover group">
                  <div class="flex flex-col min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <span class="text-14-medium text-text-strong truncate">{config.name}</span>
                      <span class="text-11-regular text-text-weaker uppercase">{config.type}</span>
                    </div>
                    <span class="text-12-regular text-text-weaker truncate">
                      {config.type === "local"
                        ? `${config.command?.join(" ") || ""}`
                        : config.url || ""}
                    </span>
                  </div>
                  <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                    <IconButton
                      icon="checklist"
                      variant="ghost"
                      onClick={() => handleEdit(config)}
                      title="Edit"
                    />
                    <IconButton
                      icon="close"
                      variant="ghost"
                      onClick={() => handleDelete(config.name)}
                      title="Delete"
                    />
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>

        <Show when={!isLoading() && configs().length === 0}>
          <div class="text-center py-8 text-text-weaker text-14">
            No MCPs configured. Add one to get started.
          </div>
        </Show>
      </div>
    </Dialog>
  )
}

export { DialogManageMcp }
