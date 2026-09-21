# Agent Note: Trade workspace navigation and business state

Status: implemented

English | [中文](2026-09-21-trade-workspace-product-design.zh.md)

## Problem

Routine enterprise work spans company records, assets, buyer opportunities, tasks, websites and connected computers. A company presentation and feature demonstrations do not tell a returning user what is available or what needs attention. Independently styled panels also obscure that these activities belong to one workspace.

## Decision

The [enterprise panel](../../../../trade/enterprise/src/client.tsx) opens a workspace overview for an established company. The overview is structured as a goal brief, a workstream, a decision queue and an outcome rail derived from saved enterprise records; the [goal-first home decision](2026-09-21-trade-home-goal-first.md) owns that presentation. Company presentation remains a separate tab with its existing source details and maintenance actions. Empty workspaces describe the next useful action; they do not substitute example companies, business results or invented performance metrics for missing records.

Enterprise records, websites and connected computers share typography, spacing, surfaces and interaction states. Primary controls describe business actions. Websites present a static creation guide and working creation controls. Connected computers show saved devices and assignments first; their demonstration is collapsed by default, and connection administration opens on request. The deployment contributes its identity through the native sidebar slots, retaining the existing application navigation and conversation services.

Interaction feedback distinguishes selection, keyboard focus and pending requests. Short transitions provide continuity without implying progress that the server has not reported. Manual refresh receives feedback independently of background polling, so periodic updates do not repeatedly demand attention. Reduced-motion preferences preserve state and text feedback while suppressing animation. Keyboard tab selection keeps focus on the selected control.

The opt-in [FORM component collection](../../../../trade/enterprise/README.md#reusable-design-components) separates reusable React presentation from business actions. Its CSS tokens are scoped to `.td-root`; localized text and action callbacks come from the caller. Its offline preview owns synthetic examples and temporary interaction state, while production records and confirmation authority remain in the existing modules. Preview composition styles are separate from reusable styles, so importing a card cannot replace the application shell or theme.

The [profile guide](../../../../trade/enterprise/src/client-onboarding.tsx) appears within Assistant and presents progress cards derived from saved sources and reviewed records. An empty enterprise opens the guide directly. Opening the guide does not send a model request. Its explicit conversation action resumes the persisted onboarding conversation; visual completion does not replace the user's review and scope confirmation.

The [supplier reading decision](2026-09-20-supplier-profile-reading.md), [enterprise ownership decision](../architecture/2026-09-14-local-enterprise-workspace.md) and [Commerce ownership decision](../architecture/2026-09-21-commerce-business-runtime-separation.md) remain active. This presentation decision changes neither record ownership nor the approvals required for confirmation, sharing and publication.

## Alternatives considered

**Keep the company presentation as the workspace home.** The presentation explains what the company offers, but routine work also requires visibility into saved tasks, sources and opportunities. A separate tab preserves its reading purpose while the workspace overview supports returning users.

**Add example business metrics to fill the dashboard.** Example revenue, conversion and growth figures would imply facts the workspace does not own. Counts and states from existing records remain useful without introducing unsupported business claims.

**Replace the upstream application shell.** The native slots already support deployment identity and business panels. Replacing the shell would duplicate conversation, authentication and navigation behavior without improving the business records.

**Copy page-specific styles for each new component.** Copies can diverge in focus, status and theme behavior. Scoped tokens and composable components provide shared presentation without moving business state into the design library.

## Consequences

Users have a consistent starting point while detailed business operations retain their existing owners. The overview reflects locally saved records and does not establish commercial verification, tenant isolation or live service health. Responsive layout, keyboard access, empty states and existing editing flows require browser verification; appearance alone does not prove that model requests or external services succeed.

The component preview builds as one offline HTML file. Browser checks cover source filtering, review states, native dialog dismissal and focus return, input errors, both themes and locales, reduced motion and narrow-screen overflow. The preview performs no enterprise requests; adopting its components in a business page still requires that page's existing persistence and approval checks.
