---
icon: 📝
---

# Por que Markdown Puro Vence

**Status:** em revisão. Alvo: 18/06/2026.

De tempos em tempos um app de notas querido fecha as portas, e milhares de pessoas descobrem que as notas nunca foram realmente delas. O export é um zip de sopa de HTML, os links estão quebrados, as imagens sumiram.

Arquivos Markdown numa pasta são sem graça. Esse é exatamente o ponto.

## Sem graça é uma feature

- Um arquivo `.md` de 2004 ainda abre hoje, em qualquer coisa.
- Pastas são uma hierarquia que todo mundo já entende.
- `grep`, Spotlight, Time Machine, git: um ecossistema inteiro funciona de graça.

## "Mas arquivo comum não faz X"

Faz mais do que parece:

1. **Links entre notas?** Wiki links são só texto: `[[Assim]]`.
2. **Metadados?** Um pequeno bloco de frontmatter no topo do arquivo.
3. **Imagens?** Um caminho relativo para um arquivo na mesma pasta.

O trabalho do app é fazer esses arquivos comuns parecerem ricos, não substituí-los por um banco de dados.

## O teste que aplicamos a toda feature da Paperly

> Se a Paperly desaparecesse amanhã, os dados dessa feature continuariam legíveis num editor de texto comum?

Se a resposta for não, a feature volta para a prancheta.
