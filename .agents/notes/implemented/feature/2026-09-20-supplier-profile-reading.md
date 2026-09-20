# Agent Note: Supplier profile reading and focused maintenance

Status: implemented

English | [中文](2026-09-20-supplier-profile-reading.zh.md)

## Problem

Reading a supplier profile requires understanding its offerings and supporting sources. Showing every editable claim and relationship at once makes that task compete with data maintenance.

## Decision

The [supplier workspace](../../../../trade/enterprise/src/client-supplier.tsx) presents company positioning alongside a large cover photograph. Products, cases and capabilities have dedicated image areas, a title and a short summary; conditions, buyer tags and evidence appear in details. The overview shows up to two entries per primary collection and folds secondary business content. Search and collection filters expose the remaining entries.

Optional profile media stores a cover asset and explicit graph-node image assignments. The picker uses uploaded images, preserves empty image areas and supports upload, replacement and removal. Display selection does not create evidence, attest a graph or grant external access. An object without a display assignment may use its explicitly linked image evidence. Unrelated uploads never become automatic covers. Removing a display assignment retains the file; deleting a file clears its profile media assignments. File names accompany photographs, including the generated-example labels in the isolated demo.

The supplier graph owns optional presentation preferences so title, introduction, focus, collection order and featured ids participate in draft revisions and human confirmation. Automatic presentation derives product, service or project priorities from structured business objects instead of company-name keywords or generated marketing claims. Explicit choices can retain an empty collection as a visible completion prompt. Secondary content remains navigable and searchable. Featured references must resolve; deleting an object removes its featured reference. Media remains independently owned by the enterprise profile. Layout selection neither attests claims nor changes external grants. The shared renderer varies hero proportions, solution presentation and reading order; it does not execute model-generated page code.

Chat remains the primary update entry. Manual maintenance selects one object or evidence record at a time and expands secondary fields on demand. All edits retain the complete graph as a detached draft; cancelling dirty edits requires a discard choice. Saving and confirming remain separate actions. A visible draft notice and confirmed-version switch distinguish the displayed content from externally authorized content.

The [enterprise ownership decision](../architecture/2026-09-14-local-enterprise-workspace.md) continues to govern persistence, whole-revision confirmation, source attestation and external disclosure. Reading layouts do not create a second profile or alter those authorities.

## Alternatives considered

**Style the complete form.** Color and spacing cannot remove unrelated fields from a reading task. Forms belong to explicit maintenance actions.

**Save each card independently.** A claim can reference evidence and relationships elsewhere in the graph. Whole-draft saves preserve existing validation and revision checks.

## Consequences

Browsing needs fewer controls while precise maintenance remains available. Detail panels retain keyboard focus, restore the invoking control when it remains mounted, and scroll within the viewport. Browser tests exercise search, item selection, dirty cancellation, confirmation, source reading and procurement operations on the shipped profile, with desktop and mobile screenshots. They do not establish live-model success for conversational updates.
