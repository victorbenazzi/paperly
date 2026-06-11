# Plano: noteflow, um Notion clone local (markdown vault + agentes de IA)

## Contexto

Victor quer um app desktop para Mac, novo e separado do metacodex, que funcione como um Notion local / quase-Obsidian:

- **Arquivos markdown puros no disco** organizados em vaults (pastas raiz registradas, modelo Obsidian, múltiplos vaults).
- **Editor Notion-style fluido**: blocos arrastáveis, slash menu, imagens, links, código, embeds.
- **Gestão de arquivos**: criar, renomear, mover, organizar em pastas/hierarquias, visualizar imagens.
- **IA em primeira classe na v1**: chat/agente embutido (sidecar opencode) que lê e escreve nas notas; o vault em markdown puro garante que qualquer agente externo (Claude Code, opencode) também trabalhe nas notas.
- **Design system Notion fornecido**, multi-tema light/dark.

### Decisões fechadas com o usuário

| Decisão | Escolha |
|---|---|
| Localização | Repo novo em `~/Documents/noteflow` (git próprio) |
| Stack web | Vite 7 + React 19 + TS + Tailwind v4 + shadcn/ui + Zustand 5 |
| Editor | BlockNote (Notion-style, slash menu, blocos) |
| Vault | Múltiplos vaults (registry de pastas), `.md` puro no disco |
| Engine IA | Sidecar opencode (padrão do metacodex) |
| Escopo IA v1 | Vault agent-friendly + chat embutido + templates de docs de agentes (nice-to-have) |

O metacodex (`/Users/victor/Documents/metacodex`) NÃO é modificado; serve de referência de padrões já resolvidos (sandbox de paths, escrita atômica, watcher, sidecar opencode, temas via CSS vars).

## Decisões técnicas centrais

1. **Tailwind v4** (não v3): o shadcn CLI atual assume v4 (config CSS-first via `@theme`); os tokens vivem em `src/styles/tokens.css` puro + `@theme inline`, então o design system independe do Tailwind se precisar reverter.
2. **Formato no disco: .md canônico + frontmatter YAML** (icon, cover, created/updated) via `gray-matter`. Título = nome do arquivo (H1 estilo Notion no topo, fora do editor; editar o título chama rename). Sem sidecar JSON (dessincroniza quando um agente edita só o .md).
3. **Conversão blocks ↔ md atrás de um seam**: interface `MarkdownCodec` em `src/features/editor/markdown/codec.ts`. Implementação inicial = `blocksToMarkdownLossy`/`tryParseMarkdownToBlocks` do core (MIT). Spike na Fase 2 avalia `@blocknote/xl-markdown` (fidelidade maior, licença AGPL/dual; ok para app pessoal) e troca só esse arquivo. Features que não sobrevivem ao round-trip (cor de texto/fundo, alinhamento) ficam escondidas da UI do BlockNote.
4. **Skin do editor**: spike na Fase 2 entre `@blocknote/shadcn` (coerência com o resto do app) e `@blocknote/mantine` (skin default, mais maduro; tem histórico de menos bugs de popover). Critério: menus/slash menu/popover funcionando + theming pelos nossos tokens (`--bn-colors-*` mapeados para `--canvas`/`--ink`/`--accent`). Qualquer um dos dois é aceitável; o CSS fica encapsulado no editor.
5. **Imagens: bytes via comando, não asset protocol**: `read_file_bytes` (base64 + mime, roots-checked, limite ~25MB) → object URL no front com cache/revoke. Evita o scope dinâmico do assetProtocol com vaults registrados em runtime (chato de manter). Asset protocol fica como otimização futura.
6. **Navegação estilo Notion: uma nota aberta por vez** + histórico back/forward (`nav.store`), sem tab strip. Quick switcher Cmd+P cobre o "pular entre notas". Um único documento BlockNote montado (recriado por path, nunca reusado entre arquivos).
7. **Árvore = cache plano de diretórios** (`dirCache: Record<absDir, TreeEntry[]>` lazy via `read_dir`), não árvore aninhada em memória: invalidação por `fs://changed` fica trivial. Hierarquia Notion: `Nome.md` + pasta irmã `Nome/` renderizados como UM nó expansível (folder note, compatível com export do Notion e com Obsidian); merge é só apresentação no `tree.store`.
8. **Wiki-links `[[Nome da Nota]]`** como formato primário (compat Obsidian + agentes); aceita `[texto](caminho.md)` na leitura. Custom inline content no schema BlockNote; resolução por basename case-insensitive via índice da árvore; autocomplete `[[` fica pra v1.5.
9. **Deletar = Lixeira do macOS** (crate `trash`): notas são dados do usuário, não código versionado.
10. **CSP `null`** (como o metacodex): necessário para fetch/SSE do webview com `http://127.0.0.1:<porta>` do sidecar. App local-first; documentar no README.
11. **Dev isolation**: env var `NOTEFLOW_HOME` (`~/.noteflow` vs `~/.noteflow-dev`), espelho do `METACODEX_HOME`.

## Design system (tokens)

`src/styles/tokens.css`, `:root`/`[data-theme="light"]` + `[data-theme="dark"]`; Tailwind v4 consome via `@theme inline`; shadcn consome as mesmas vars. Inter via `@fontsource-variable/inter`, tracking negativo nos displays conforme o spec.

| Token | Light | Dark |
|---|---|---|
| `--canvas` / `--canvas-soft` | #ffffff / #f6f5f4 | #191919 / #202020 |
| `--hairline` | rgba(55,53,47,.09) | alpha claro equivalente |
| `--ink` / `--body` / `--muted` | #37352f / #57564f / #9b9a97 | #d4d4d4 / derivados |
| `--accent` / `--accent-active` / `--on-accent` | #0075de / #005bab / #fff | #4ba3f5 / #2e8de8 / #fff |
| `--secondary` (indigo) | #213183 | #182457 |
| Sticker palette `--accent-{sky,purple,pink,orange,teal,green,brown}` | valores do spec | dessaturados |
| Radius | 4 / 5 / 8 / 12 / 16 / pill | idem |
| Sombras | 3 níveis multi-layer quase transparentes do spec | idem |

Regras do spec: `--accent` azul é o ÚNICO acento estrutural (CTA, links, foco, item ativo); sticker palette só decora (ícones de página, dots); inputs radius 4, botões utilitários 8, cards 12, CTAs pill; body 400, títulos 700 com tracking negativo.

## Estrutura do projeto

```
noteflow/
├── src-tauri/src/
│   ├── lib.rs / main.rs          # builder, generate_handler, managed state
│   ├── error.rs                  # AppError {code,message} (porte de metacodex error.rs)
│   ├── config_paths.rs           # ~/.noteflow, NOTEFLOW_HOME, read_json/write_json_atomic
│   ├── util/paths.rs             # normalize léxico + ensure_within_roots (porte 1:1)
│   ├── fs_ops.rs                 # atomic_write tmp→rename, read_dir, stat, text/bytes
│   ├── vaults.rs                 # VaultsCache (análogo a projects.rs), fonte dos roots
│   ├── watcher.rs                # fase 4 (porte de watcher.rs, manter rewrite canônico FSEvents)
│   ├── search.rs                 # fase 4 (grep-searcher + ignore)
│   ├── agent/runtime.rs          # fase 5 (porte simplificado: sem cron/MCP/skills)
│   └── commands/{vaults,filesystem,workspace,settings,watcher,search,agent,system}.rs
├── src/
│   ├── app/                      # AppShell (3 colunas), TitleBar (overlay + drag-region), WelcomeScreen
│   ├── components/{ui,layout,tree,editor,agent}/
│   ├── features/{theme,i18n,vaults,tree,nav,editor,assets,search,agent,settings,templates}/
│   ├── lib/                      # ipc.ts (CMD const + invoke<T>), cn.ts, events.ts, fuzzy.ts
│   └── styles/tokens.css
└── ~/.noteflow/                  # settings.json + state/{vaults.json, workspace/{vaultId}.json}
```

Persistência: JSON atômico legível, padrão `write_json_atomic`/`read_json` com defaults (nunca crash em arquivo corrompido). Workspace por vault: `{expanded, openPath, sidebarWidth}` debounced 500ms.

## Camada editor ↔ disco (detalhe)

- **Autosave**: debounce 800ms após `onChange`; flush em blur da janela, troca de nota e quit. Pipeline: `editor.document` → codec → re-anexa frontmatter (atualiza `updated`) → `write_file_text` atômico. Guardar `lastSavedContent`; skip write se serialize idêntico.
- **Mudança externa na nota aberta** (`fs://changed`): conteúdo lido === `lastSavedContent` → eco do próprio save, ignorar (comparação de conteúdo é mais robusta que janela de tempo). Não-dirty → substituir documento silenciosamente. Dirty → banner não-modal com [Recarregar do disco] / [Manter minha versão]. Sem merge automático na v1.
- **Upload/paste/drag de imagem**: prop `uploadFile` do `useCreateBlockNote` → `vault_save_asset(vaultId, fileName, bytesB64)` salva em `assets/` na raiz do vault como `{slug-da-nota}-{nanoid6}.{ext}` → markdown `![alt](assets/foo-a1b2c3.png)` (relativo à raiz, compat Obsidian) → render via object URL.
- **Embeds** (fase 6): markdown = URL pura em linha própria; custom block `embed` renderiza iframe allowlisted (YouTube/Vimeo/Figma). Recortável sem dano.
- **Operações de hierarquia**: renomear/mover nota = `X.md` + pasta `X/` juntos (comando `rename_note`); criar subpágina cria `X/` se necessário; pasta sem .md homônimo = pasta pura.
- Módulos: `editor/markdown/codec.ts`, `editor/markdown.ts` (frontmatter + wiki-links), `editor/schema.ts` (inline wikiLink, block embed), `editor/editor.store.ts`, `editor/NoteEditor.tsx`, `editor/blocknote-theme.ts`, `assets/useVaultImage.ts`, `assets/paste.ts`.

## Fases (cada uma termina com app rodando; commit local por fase)

### Fase 0: Scaffold + design system
```bash
cd ~/Documents && pnpm create tauri-app@latest noteflow --template react-ts --manager pnpm
cd noteflow && git init
pnpm add tailwindcss @tailwindcss/vite && pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button dialog dropdown-menu context-menu tooltip input separator scroll-area popover command
pnpm add zustand i18next react-i18next clsx tailwind-merge lucide-react nanoid @fontsource-variable/inter
pnpm add @tauri-apps/api @tauri-apps/plugin-dialog @tauri-apps/plugin-os @tauri-apps/plugin-process
```
Cargo: `tauri@2`, plugins `single-instance/dialog/os/process`, `serde(_json)`, `thiserror`, `tokio(full)`, `parking_lot`, `uuid`, `chrono`, `dirs`, `which`. Pinar versões exatas no primeiro commit.
`tauri.conf.json`: identifier `com.noteflow.app`, `titleBarStyle: "Overlay"` + `hiddenTitle: true`, min 880×560, `security.csp: null`, porta 1420.
Portar: `error.rs`, `config_paths.rs` (NOTEFLOW_HOME), `util/paths.rs`. tokens.css completo. `theme.store` (localStorage no module load, sem FOUC, matchMedia) + i18n en/pt-BR no module load. TitleBar com `data-tauri-drag-region` em CADA elemento do click path. Shell 3 colunas (sidebar | editor | painel IA colapsado). Script `scripts/check-no-emdash.sh` (grep `—`/`–` em src/) no `pnpm build`.
**Verificar**: janela abre e arrasta pela titlebar; toggle light/dark sem flash e persiste; pt-BR persiste; `NOTEFLOW_HOME=~/.noteflow-dev` cria árvore isolada; grep de em-dash vazio.

### Fase 1: Vaults + árvore + CRUD
Comandos (todos FS com `ensure_within_roots`; roots = vaults do `VaultsCache`):
`vault_list/add/create/remove/rename/set_active`, `read_dir`, `stat`, `read_file_text`, `write_file_text`, `create_file` (anti-colisão "Untitled 2.md"), `create_dir`, `rename_path`, `delete_path` (→ Lixeira via `trash`), `move_path`, `reveal_in_finder`, `save/load_workspace_state`.
Stores: `vaults.store`, `tree.store` (dirCache, expanded, seleção, merge folder-note, inline rename/create), `nav.store` (openPath + histórico).
UI: WelcomeScreen sem vault; dropdown de vault no topo da sidebar; árvore Notion-style (hover revela + e ⋯); context menu; drag-move com POINTER EVENTS (nunca HTML5 drag, WKWebView quebra com Radix Slots). Painel central provisório: `<pre>` do texto cru.
**Verificar**: registrar vault com .md existentes; criar/renomear/mover/deletar refletem no Finder; deletar vai pra Lixeira; `ipc(CMD.readFileText, {path:"/etc/hosts"})` → `{code:"PathNotAllowed"}`; restart preserva vault ativo + expansão.

### Fase 2: Editor BlockNote
Spike inicial (1-2h): (a) skin shadcn vs mantine, (b) coexistência CSS com preflight do Tailwind v4, (c) fidelidade xl-markdown (AGPL) vs core lossy. Decidir e pinar.
`pnpm add @blocknote/core @blocknote/react @blocknote/{shadcn|mantine} gray-matter` (+ xl-markdown se aprovado).
Implementar `codec.ts` (stub lossy → real), `markdown.ts` (frontmatter), `editor.store` (autosave 800ms, flush, skip-if-equal, dirty), `NoteEditor.tsx` (key = path), `blocknote-theme.ts` (tokens → `--bn-colors-*`, reage ao theme.store). Título H1 fora do editor = nome do arquivo, editar chama `rename_path`. Esconder cores/alinhamento da UI.
**Verificar**: slash menu, headings, listas, todo, code block; parar de digitar ~1s → .md atualizado e legível (`cat`); matar o app no meio da digitação não trunca arquivo (escrita atômica); abrir no Obsidian renderiza bem; dark mode cobre menus/seleção/code block; round-trip de tabela e lista aninhada sem corrupção.

### Fase 3: Imagens + assets
Comandos: `read_file_bytes` (base64+mime, limite com `FileTooLarge` i18n), `vault_save_asset`, `open_with_default_app`.
Front: `useVaultImage` (path → object URL, cache + revoke); resolver de imagens relativas no editor; `uploadFile` do BlockNote (paste/drag/picker); viewer de imagem ao clicar em .png/.jpg na árvore (zoom fit/100%); PDF/zip abrem no app padrão.
**Verificar**: colar imagem → `![](assets/...)` no .md → renderiza após reabrir; imagem da árvore abre no viewer em light/dark; nota com `![](pasta/foto.png)` renderiza.

### Fase 4: Watcher + busca + wiki-links
Cargo: `notify`, `notify-debouncer-mini`, `ignore`, `grep-{searcher,regex,matcher}`.
Portar `watcher.rs` (80ms, idempotente, keyed por vaultId, MANTER o rewrite de prefixo canônico→root do FSEvents, sem ele vault em pasta iCloud/symlink fica morto; filtrar `.git/`, `.obsidian/`, `.noteflow/`). Evento `fs://changed {vaultId, paths}` → invalida dirCache + fluxo de conflito do editor.
`search_in_vault` + `list_files`; Cmd+P quick switcher (cmdk + fuzzy portado) e Cmd+Shift+F com snippets. Wiki-links `[[nota]]` (inline content + navegação).
**Verificar**: `touch nota.md` no terminal → árvore atualiza <200ms; edição externa da nota aberta recarrega (banner se dirty); autosave NÃO flicka a própria nota; Cmd+P fuzzy acha por nome; Cmd+Shift+F acha por conteúdo; `[[link]]` navega.

### Fase 5: IA (opencode sidecar)
Cargo: `reqwest (json, rustls)` + `rustls(ring)` com `install_default()` no setup (sem isso reqwest panica), `base64`.
Portar `agent/runtime.rs` SIMPLIFICADO (spawn `opencode serve --port 0 --hostname 127.0.0.1`, URL via log file, health check, adoção de órfão via `state/runtime.json`, kill no quit; cortar cron/MCP/skills). Comandos: `agent_runtime_start/status/stop/restart`, `agent_list_models` (strip de keys).
Front: `oc.ts` (helpers portados), `runtime.store` (start lazy ao abrir painel), `chat.store` (sessões por vault via REST, SSE direto do webview, TODA chamada com `?directory=<vault root ativo>`), `AgentPanel.tsx` (painel direito recolhível, composer, picker de modelo, indicador de tool calls), respostas com `react-markdown` + `remark-gfm`. Erro amigável se binário opencode ausente (`which`). Edições do agente chegam de graça via watcher.
**Verificar**: painel abre → sidecar sobe; fechar app mata processo; relançar adota órfão; picker sem API keys no payload; "resuma a nota X" lê o arquivo certo; "crie TODO.md" aparece na árvore e abre; agente edita nota aberta → reload/banner; trocar vault muda o `?directory=`.

### Fase 6 (nice-to-have): embeds + templates de agentes
Block `embed` allowlisted. Templates .md (prompt de agente, skill, spec) i18n-aware no "New from template" do context menu. Só entra com fases 1-5 verificadas.

## Riscos

| Risco | Mitigação |
|---|---|
| shadcn CLI / Tailwind v4 mudarem defaults | Pinar versões no 1º commit; tokens em CSS puro independem |
| Skin BlockNote (shadcn imaturo?) / CSS vs preflight v4 | Spike no início da Fase 2 decide shadcn vs mantine |
| Licença AGPL do xl-markdown | Spike; fallback lossy do core é aceitável |
| Eco autosave ↔ watcher (loop de reload) | Compare `lastSavedContent` + skip-if-equal + guarda de dirty |
| FSEvents canonicaliza paths (vault iCloud/symlink) | Portar o rewrite de prefixo do watcher do metacodex |
| Dev + app instalado disputando estado/sidecar | `NOTEFLOW_HOME` + guarda de config-root na adoção |
| Perda de dados em delete | Lixeira via crate `trash` |

## Notas de execução
- Usar as skills `frontend-design` + `ui-ux-pro-max` no trabalho de UI (exigência do Victor).
- NUNCA em-dash em nenhum texto (script de check no build); i18n nas duas locales desde o primeiro componente.
- Commits locais por fase, sem trailer Co-Authored-By; NUNCA push sem ordem explícita.

## Verificação end-to-end (final)
1. `pnpm tauri dev`; criar vault numa pasta de teste.
2. Criar hierarquia (página + subpáginas via folder note), nota com headings, lista, tabela, code block, imagem colada, `[[wiki-link]]`.
3. Abrir a mesma pasta no Obsidian/editor de texto: markdown legível, imagens em `assets/`, links funcionam.
4. Editar nota fora do app → app reflete (banner se dirty).
5. Painel IA: agente lista, cria e edita notas; mudanças ao vivo via watcher.
6. Toggle light/dark + en/pt-BR sem quebra visual; design fiel ao spec Notion (azul único acento, hairlines, sombras suaves).
