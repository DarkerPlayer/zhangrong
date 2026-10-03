# Local Text Packs — implementation contract

User requests locally feeding text or a book and extracting reusable corpora/text packs. Existing authorization is to implement features directly. Preserve all existing repository and user-data changes. No cloud requests, no training weights, no automatic changes to persona identity or memories.

## User flow

Text Workshop entry in persona page and reading workstation. Paste text or import TXT/MD/EPUB/DOCX/text PDF or a previously exported JSON pack. Choose dialogue extraction or complete reading segmentation. Review source locations, search, select short entries, optionally classify selected entries with the installed local model. Save the full pack separately on disk; export JSON/TXT; add selected entries into the chosen persona without evicting existing entries. Preview one segment with the existing voice service. Scanned/encrypted PDF must report unsupported content rather than success with empty text.

## Limits / ownership

20 MiB input file, 1,000,000 decoded text characters, 10,000 entries, 240 characters per entry, page size at most 50. Reading segmentation preserves repeats; dialogue extraction deduplicates exact phrases and records occurrence counts. At most 30 saved packs / 3 transient drafts, bounded files, no archive extraction to arbitrary filesystem locations. Use the existing local user-data sibling directory `text-library`; tests must inject isolated directories. No large book content in localStorage or chat prompts. Drafts survive view closure and expire after a day. Deletion moves packs into local trash. Source metadata preserves filename, chapter/page/paragraph, never arbitrary filesystem paths.

## Shared API contract

Base `/api/text-packs`:
- GET base -> `{packs: metadata[]}` (saved and non-expired drafts).
- POST `/extract` JSON `{text?,fileBase64?,name?,title?,mode:'dialogue'|'reading'}` -> page result below. Exactly one of text/fileBase64. JSON imports preserve validated portable pack contents.
- GET `/:id?offset=0&limit=25&query=&kind=` -> `{pack,entries,total,offset,limit}`. Filters optional; total is filtered count.
- POST `/:id/save` `{title}` -> `{pack}`.
- POST `/:id/select` `{ids}` -> `{entries}`; at most 40.
- POST `/:id/classify` `{ids,model?}` -> `{entries,model}`; at most 8 selected entries per request, updates categories only and preserves original speakers; request abort cancels model.
- POST `/:id/labels` `{labels:[{id,category}]}` -> `{entries}`; manually correct category labels, never rewrite original text.
- POST `/:id/delete` `{}` -> `{ok:true}`.
- GET `/:id/export?format=json|txt` -> download, includes whole pack in order.

Metadata: `{id,title,draft,mode,sourceName,sourceFormat,sourceCharacters,totalEntries,createdAt,updatedAt,warnings,stats:{dialogue,narration,duplicates}}`.
Entry: `{id,text,kind:'dialogue'|'narration',category,speaker,source:{chapter,page?,paragraph,offsetStart?,offsetEnd?},occurrences?}`. Category uses existing ten persona category IDs, default fallback. Speaker comes only from explicit source markers; model category labels are advisory. Text is never rewritten by classification.
Portable export schema: agent storage defines versioned `format:'muyu-text-pack'`, `version:1`, metadata + entries, validates import bounds/provenance and assigns a new pack ID.

## Worker boundaries

Document parser agent: `server/document-parser.mjs` exports `parseTextDocument({text?,fileBase64?,name?},{signal}={})` -> `{sections:[{text,chapter,page?,paragraph?}],warnings,format,sourceName}`. Handles formats and limits; Python stdlib worker for archive formats. PDFKit compiled Swift helper packaged in `.runtime/documents/pdf-text`, no Office or compiler needed by delivered app. Own parser files/tests and the specific build-desktop ignore inclusion for new runtime.

Pack domain agent: `server/text-packs.mjs` exports `createTextPackLibrary({directory,parseDocument?})` and `DEFAULT_TEXT_PACK_DIRECTORY`, `TEXT_PACK_BODY_LIMIT`. Async service methods `.list()` -> `{packs}`, `.extract(input,{signal})` -> page, `.page(id,options)` -> page, `.save(id,{title})` -> `{pack}`, `.select(id,{ids})` -> `{entries}`, `.applyLabels(id,labels)` -> `{entries}` (labels id/category/speaker only), `.remove(id)` -> `{ok:true}`, `.export(id,format)` -> `{body,contentType,filename}`, `.close()`. Default parser imports document-parser. Own service/extraction tests; do not touch parser/App/server index.

UI agent: `src/TextWorkshop.jsx` + CSS + UI tests, default component props `{personaId,personaName,corpusCount,model,onApplyEntries,onRead,onStopRead,onClose}`. onApplyEntries({personaId,pack,entries}) returns number imported or throws readable error; all async operations tied to originating persona and cancelled on switch/unmount. Existing role capacity is 40 minus corpusCount. onRead(text) previews one entry using existing active voice. No full-book continuous TTS this version. Own new component only, root wires entry points.

Root: API routes, local classifier, persona batch import/provenance, App/PersonaPage links, version/docs, review/integration and staged native delivery preserving data. Do not modify old user corpora automatically.

## Verification

Parser fixtures all formats, encrypted/scan PDF rejection, archive expansion limits/path handling/cancellation. Extraction boundaries, quote handling, stable reading sequence, limits/dedup. Portable pack roundtrip, invalid paths/IDs/schema, disk persistence/isolation/deletion. Persona full-capacity and duplicate import must preserve old records. UI selection/pagination/error/cancel/persona switch. Classifier validates IDs/categories and treats source text only as untrusted data. Integration HTTP tests and full existing suite, Vite build, isolated browser smoke, then update packaged app with backup.

## Completed 2026-10-03

Implemented all scoped formats, extraction modes, on-disk pack library, paged UI, portable exports, role-specific selected imports and optional local classification with manual correction. Full suite: 430 passing, none failed/skipped. Production build passed; existing main-bundle size warning remains. Isolated UI checked real Qwen3.5 4B classification, persistence, manual tags and selected import. Actual TXT reading export was byte-identical. Installed app parser verified with its bundled Python and PDF helper. Native 1.18.0 startup preserved all 6 existing roles and current profile selections. Final native visual inspection identified navigation overlap; workshop is now positioned within the main stage, adapting to the existing sidebar/mobile layout. Backup: `release/backups/before-1.18.0-20261003-002245/`.
