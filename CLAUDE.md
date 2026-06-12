# CLAUDE.md

## Projeto

- **Paperly**: app de notas Markdown local-first (Tauri 2 + React 19 + BlockNote). A pasta local chama `noteflow`, mas o produto e o repo são Paperly: `victorbenazzi/paperly` (GitHub, público).
- Gerenciador: pnpm. `pnpm tauri dev` roda o app; `pnpm dev` sozinho roda só a UI no navegador usando o mock de IPC (`src/lib/ipc.mock.ts`).
- i18n en + pt-BR em `src/features/i18n/locales/`; toda string nova entra nos dois arquivos.
- `docs/` é a landing page (HTML puro) servida pelo GitHub Pages (main, pasta `/docs`), no ar em `https://victorbenazzi.github.io/paperly/` desde 12/06/2026. Os botões de download resolvem a release mais nova via API do GitHub em runtime, com fallback para a página de releases. O custom domain `victorb.me` foi REMOVIDO do site de usuário (`victorbenazzi.github.io`) em 12/06/2026 porque o DNS está morto (NXDOMAIN); quando o DNS voltar, re-adicionar o CNAME lá (os project pages, incluindo a LP, voltam a redirecionar pro domínio).
- Copy/marketing: NÃO prometer "sem sync". Sync opcional está no roadmap (estilo Obsidian). Usar "sem conta, sem lock-in, nada sai da sua máquina sem você decidir".

## Releases e auto-update

- Workflow `.github/workflows/release.yml`: tag `v*` (ou workflow_dispatch) builda macOS arm64/Intel, Windows e Linux (deb/rpm, sem AppImage) via `tauri-apps/tauri-action` e cria a release como **draft** com `latest.json` assinado (`includeUpdaterJson: true`).
- A publicação é manual de propósito: revisar o draft no GitHub e clicar Publish. Só release publicada chega nos apps (endpoint `releases/latest/download/latest.json`).
- Fluxo de release: bump da versão em `package.json`, `src-tauri/Cargo.toml` e `src-tauri/tauri.conf.json` (os 3 sempre iguais), commit, `git tag vX.Y.Z`, push da tag, publicar o draft.
- Updater no app: `tauri-plugin-updater`; endpoint e pubkey em `src-tauri/tauri.conf.json` (`plugins.updater`); capability `updater:default`; `bundle.createUpdaterArtifacts: true`.
- Frontend: `src/features/updates/` (store zustand + service com `checkSilent`/`startInstall`) e `src/components/updates/UpdatePill.tsx` (pílula azul no MainHeader). Check silencioso 3s após o boot no `AppShell`; em dev nada roda (guard `import.meta.env.DEV`).
- Secrets do repo (já configurados): `TAURI_SIGNING_PRIVATE_KEY(_PASSWORD)` e `APPLE_CERTIFICATE(_PASSWORD)`. O material privado vive SÓ em `~/.paperly-signing/`. Nunca commitar, imprimir em log ou regenerar sem motivo.
- Cert macOS autoassinado estável (`paperly self-signed`, gerado por `scripts/gen-signing-cert.sh`): mantém as permissões TCC entre updates. **Não regenerar** (reseta as permissões de todo usuário). Não notariza: o macOS (Sequoia+) bloqueia até o `.dmg` baixado, sem botão de escape; a instrução de instalação é `xattr -d com.apple.quarantine ~/Downloads/Paperly_*.dmg` ANTES de abrir o `.dmg` (o app arrastado herda a liberação; não usar mais o xattr no app instalado).
- Linux deb/rpm não recebem auto-update (limitação do Tauri); atualiza via gerenciador de pacotes.
- Histórico: v0.1.0 publicado em 12/06/2026 (primeiro release). v0.2.0 publicado em 12/06/2026 (botão "Buscar atualizações" nas Configurações, via `checkManual` no service; estados `upToDate`/`checkError` só aparecem lá, a pílula ignora). Com 2 releases publicados, o e2e da pílula ficou possível: um v0.1.0 instalado deve mostrar a pílula no boot.
- Deprecação do Node 20 nas actions: resolvida em 12/06/2026 com bump de `actions/checkout`, `actions/setup-node` e `pnpm/action-setup` pra `@v6` (runtime Node 24). O `node-version: 20` do setup-node é o runtime do BUILD (vite), não foi afetado pelo aviso.
