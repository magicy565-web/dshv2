/** Procurement fixture contains a sourced capability and an explicitly unknown MOQ. */
export function supplierFixture(fileId) {
  return {
    nodes: [{ id: 'printing', kind: 'capability', title: 'Custom printed viscose', summary: 'Apparel fabrics for emerging brands.', productRecordId: null,
      claims: [
        { attribute: 'material', value: 'viscose', status: 'SELF_DECLARED', qualification: 'Exact weight needs confirmation.', validUntil: null, evidenceIds: ['catalog'] },
        { attribute: 'MOQ', value: '', status: 'UNKNOWN', qualification: 'Depends on construction and process.', validUntil: null, evidenceIds: [] },
        { attribute: 'sample lead time', value: '7 days', status: 'SELF_DECLARED', qualification: 'Historical quotation only.', validUntil: '2020-01-01T00:00:00.000Z', evidenceIds: ['catalog'] },
      ] },
    { id: 'launch', kind: 'solution', title: 'Small brand launch', summary: 'Custom printed viscose selection and sampling.', productRecordId: null, claims: [] }],
    evidence: [{ id: 'catalog', title: 'Supplier catalog', source: { type: 'document', fileId, chunk: 1 }, supports: 'Viscose and custom printing.', limitations: 'Does not establish exact GSM, current MOQ or delivery.' }],
    relations: [{ from: 'printing', to: 'launch', type: 'supports' }],
  }
}
