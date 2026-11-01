// THE APP'S OWN FILE: the rules for its synced tables (PRD section 11, docs/offline-data.md).
// The core reads this and never changes it, so a later release of the template doesn't touch
// what's here. Empty, every table is accepted and every field merges "later wins".
//
// For each table an app may give:
//
// - `guard`: fields where losing either of two edits isn't acceptable (a dose, an amount; '*'
//   for all). A device's edit to a guarded field that someone else changed after the version
//   the device had is refused with `conflict`, and the device keeps it for the person to compare
//   and resolve (Rule 6). Everything else merges "later wins".
// - `check`: runs before each change to the table is applied, inside the space's Durable
//   Object; return a refusal (`invalid_input` or `forbidden`, with a message to show the person)
//   or null. It must be quick and synchronous, with no network or D1: it runs in the
//   transaction that applies the batch. `current` is the record as the backend has it (null
//   when new); `who.role` is the person's role in the team, or null in their own space.
//
// `onlyListed: true` refuses changes to tables not listed here (`invalid_input`), once an app
// has said what all its tables are. `afterApply` runs after each batch is applied, with the
// changes that went in: for copying them somewhere else (a D1 table for reports, a
// notification). It runs after the reply is decided and its failure is only logged, so keep
// what it writes rebuildable; mind D1's 100,000 rows written a day on the free plan.
//
// Example (with `refusal` imported from '../sync/rules'):
//
//   export const syncRules: SyncRules = {
//     onlyListed: true,
//     tables: {
//       patients: {
//         check: (c) => (c.op === 'put' && c.fields?.name === '' ? refusal('invalid_input', 'A patient needs a name.') : null),
//       },
//       prescriptions: {
//         guard: ['dose', 'drug'],
//         check: (c, _current, who) =>
//           c.op === 'delete' && who.role !== 'admin' ? refusal('forbidden', 'Only a team admin can delete a prescription.') : null,
//       },
//     },
//   };

import type { SyncRules } from '../sync/rules';

export const syncRules: SyncRules = {
  onlyListed: false,
  tables: {},
};
