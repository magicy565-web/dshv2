/** File associations follow exact citations while duplicate labels remain explicit. */
import { expect, it } from 'vitest'
import { documentCitation, linkGeoSources } from '../src/geo-sources.ts'
import { fileId } from '../src/schema.ts'
import { geoFields } from '../src/geo-schema.ts'

const id = (value: number) => fileId.parse(`00000000-0000-4000-8000-${String(value).padStart(12, '0')}`)
const citation = documentCitation({ name: 'catalog.txt' }, 1)
const fields = () => geoFields.parse({ kind: 'product', name: 'AX-1', description: 'Steel part', sections: [{ label: 'Material', content: 'Steel', source: citation }], questions: '' })

it('links unique passages and preserves explicit media without duplicates', () => {
  const result = linkGeoSources({ ...fields(), assetIds: [id(1)] }, [{ fileId: id(2), citation }, { fileId: id(2), citation }])
  expect(result.assetIds).toEqual([id(1), id(2)])
  expect(linkGeoSources(result, [{ fileId: id(2), citation }])).toEqual(result)
})

it('does not infer file ownership from ambiguous labels, filenames or unknown chunks', () => {
  expect(linkGeoSources(fields(), [{ fileId: id(1), citation }, { fileId: id(2), citation }]).assetIds).toBeUndefined()
  for (const source of ['catalog.txt', '[资料: catalog.txt#片段99]']) {
    const draft = fields(); draft.sections[0]!.source = source
    expect(linkGeoSources(draft, [{ fileId: id(1), citation }]).assetIds).toBeUndefined()
  }
  expect(linkGeoSources({ ...fields(), assetIds: [id(2)] }, [{ fileId: id(1), citation }, { fileId: id(2), citation }]).assetIds).toEqual([id(2)])
})
