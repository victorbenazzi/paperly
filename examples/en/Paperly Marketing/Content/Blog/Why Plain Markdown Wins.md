---
icon: 📝
---

# Why Plain Markdown Wins

**Status:** in review. Target: 2026-06-18.

Every few years a beloved notes app shuts down, and thousands of people discover their notes were never really theirs. The export is a zip of HTML soup, the links are broken, the images are gone.

Markdown files in a folder are boring. That is the point.

## Boring is a feature

- A `.md` file from 2004 still opens today, in anything.
- Folders are a hierarchy everyone already understands.
- `grep`, Spotlight, Time Machine, git: an entire ecosystem works for free.

## "But plain files can't do X"

They can do more than people think:

1. **Links between notes?** Wiki links are just text: `[[Like This]]`.
2. **Metadata?** A small frontmatter block at the top of the file.
3. **Images?** A relative path to a file in the same folder.

The app's job is to make those plain files feel rich, not to replace them with a database.

## The test we apply to every Paperly feature

> If Paperly disappeared tomorrow, would this feature's data still be readable in a plain text editor?

If the answer is no, we redesign the feature.
