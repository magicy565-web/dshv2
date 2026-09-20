/** Template providers separate editable parameters from generated website files. */
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { SiteProject } from './types.ts'

/** Stable provider-owned identifier, independent of a particular template version. */
export type SiteTemplateId = Branded<'SiteTemplateId'>
/** JSON values that can be recorded alongside generated source. */
export type SiteTemplateValue = string | number | boolean | null
  | readonly SiteTemplateValue[] | { readonly [key: string]: SiteTemplateValue }
/** Fully resolved JSON parameters owned and validated by a template provider. */
export type SiteTemplateParameters = Readonly<Record<string, SiteTemplateValue>>
/** Discoverable template metadata; parameters is the provider's input JSON Schema. */
export interface SiteTemplateDescriptor {
  readonly id: SiteTemplateId
  readonly version: string
  readonly name: string
  readonly description: string
  readonly parameters: Readonly<Record<string, unknown>>
}
/** Trusted installed implementation of one exact template version. */
export interface SiteTemplateProvider {
  readonly descriptor: SiteTemplateDescriptor
  /** Validate untrusted input and make every default explicit.
   * @param input - Editor, model or saved JSON parameters.
   * @returns Complete serializable parameters for rendering.
   */
  resolve(input: unknown): SiteTemplateParameters
  /** Generate detached source and assets without publication.
   * @param parameters - Complete parameters produced by resolve.
   * @returns A portable project; provider code is trusted installation code.
   */
  render(parameters: SiteTemplateParameters): SiteProject
}
/** Explicit template selection, with no implicit latest-version substitution. */
export interface SiteTemplateRequest {
  readonly id: SiteTemplateId
  readonly version: string
  readonly parameters: unknown
}
/** Source-local receipt retaining the exact generating version and resolved parameters. */
export interface SiteTemplateReceipt {
  readonly format: 1
  readonly id: SiteTemplateId
  readonly version: string
  readonly parameters: SiteTemplateParameters
  readonly sourceDigest: string
}
