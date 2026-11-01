# Offline data: rules for apps that work offline

An app built from these templates may let people keep working with no connection: what they do
is written to the device (IndexedDB) and sent to the backend when the connection comes back.
When several people share the same data (a clinic's front desk, a warehouse, a team's board),
they can all be offline at once, each adding and changing records the others can't see yet.
The rules below are what make their work merge cleanly when they reconnect. Every backend and
every frontend built from the templates follows them; a backend that breaks one loses or
corrupts someone's work.

The templates carry the sync (PRD section 11): `/sync/*` in the contract, `#lib/db` in the
frontend (IndexedDB, the outbox, the sync runner) and a Durable Object per space in the
Cloudflare backend, switched on with `SYNC = "true"`. It already keeps Rules 1, 4, 5 and 7 and
the "later wins" half of Rule 6 for every table. Rules 2 and 3, and choosing "keep both" for a
field, are each app's to write, since only the app knows what its records mean.

## The example

A hospital's appointment desk. Operators A and B are both offline. A books Ali, B books Sara.
Each device writes the new appointment to its own IndexedDB. The next morning both devices
reconnect and sync.

What must come out: **two appointments, each with its own id, both kept**, and every device
then shows both.

What goes wrong with the usual database habit: if the id comes from an auto-increment counter,
both devices' last appointment was 1041, so both make 1042. On sync, one overwrites the other
(Sara's booking silently becomes Ali's) or one is refused (B's work is lost). Neither may
happen.

## Rule 1: the device makes the id, and it's unique everywhere

- Every record that can be created offline gets its primary key **on the device, at the moment
  it's created**: a UUID (version 7 preferred: time-ordered, so it indexes well; version 4 from
  `crypto.randomUUID()` also works). Two devices can't make the same one, so the ids never
  collide, whoever syncs first.
- **Never an auto-increment or a "next number" from the server** as the primary key of a table
  that syncs. The columns are `TEXT PRIMARY KEY`, as every table in the templates already is.
- **The server keeps the id it was given.** It never swaps it for one of its own: other records
  on the device already point at it (Rule 4), and rewriting ids across devices is where data
  gets lost.
- The server still checks what it gets: a well-formed id, and, if a record with that id already
  exists, that it belongs to the same person or team. Otherwise the change is refused
  (`not_found` / `forbidden`), never applied over someone else's record.

## Rule 2: numbers people read aren't the primary key

Appointment numbers, patient record numbers, invoice numbers and the like are labels, not keys.

- **Given by the server when the record syncs**, from a counter it alone keeps (per team, per
  year, as the app needs). Until then the device shows the record as pending ("No. pending").
  Nothing refers to a record by this number, only by its id.
- **If the number must exist offline** (printed on a slip at the desk), make it unique without
  the server: a short code for the device, given once when it's set up, plus that device's own
  counter (`A7-0042`). Store it in its own column with a unique index, never as the key.
- A sequence that must have no gaps (invoices, by law in many countries) is always given by the
  server, so it can only be final once synced.

## Rule 3: two different records can still clash, and the server says so

Unique ids stop records overwriting each other. They don't stop two real-world clashes, and the
backend must handle both without dropping either record:

- **The same thing entered twice.** A and B both register the same walk-in patient: two
  patient records, two ids, one person. The server can't refuse the second (B's device already
  has appointments pointing at it). It keeps both and flags them as a possible duplicate
  (same name and date of birth, same phone, same national id) for a person to merge. Merging
  moves the children to the record kept and leaves the other as a pointer to it
  (`merged_into`), so devices that still use the old id are redirected, not broken.
- **Two records competing for one thing.** A books Dr Khan at 10:00 for Ali, B books Dr Khan at
  10:00 for Sara. Both are valid appointments and both are kept. The server marks the second to
  arrive (by when the server received it) as a **conflict** and tells everyone (a notification,
  a "needs attention" list), and a person decides who moves. The backend never silently
  cancels, shifts or drops a booking made offline.

A rule like "one booking per doctor per slot" can't be enforced with a unique index on a table
that offline devices write to: whichever device syncs second would have its work refused while
the operator is no longer looking. Enforce it as a check that raises a conflict instead. Keep
unique indexes for things only the server sets (Rule 2's counters, Rule 1's ids).

## Rule 4: records refer to each other by id, and parents sync first

- An appointment made offline for a patient made offline points at the patient's device-made
  id. That works because of Rule 1: the id is final the moment it's made.
- The device sends its changes **in the order they were made**, so a patient arrives before
  their appointments. The server applies one sender's changes in that order.
- If a child still arrives before its parent (an older app version, a bug), the server holds it
  or refuses it with a code the device retries later; it never makes up a parent.

## Rule 5: every change is safe to send twice

A device sends a batch, the connection drops before the reply, and it sends the batch again.

- Every change carries its own id (a UUID from the device), and the server remembers which
  change ids it has applied (for as long as a device could be offline, at least 30 days). A
  change it has already applied is answered as applied and not done again.
- "Create" is "create this record with this id": sent twice, it's one record. Never "add one
  more appointment" with nothing to tell the two sends apart.

## Rule 6: edits to the same record, and deletes

- Two operators edit the same appointment offline (A changes the time, B adds a note). Merge
  per field: both changes are kept. When both change the **same** field, the later one wins,
  and "later" is the order the server received them, not the devices' clocks, which can be
  wrong by hours.
- An app where losing either edit isn't acceptable (doses, amounts, anything clinical or
  financial) keeps both versions and raises a conflict like Rule 3, instead of a later-wins
  merge. Decide this per table, when the table is designed.
- **Deletes are kept as markers** (`deleted_at`), not removed rows, so they sync to devices that
  were offline, and an edit to a deleted record arriving later doesn't bring it back without
  the conflict being shown.

## Rule 7: the server is the record of what happened

- Every synced record keeps who made and last changed it (account and device), the device's
  time (what the operator saw) and the server's time (when it arrived). In a hospital this is
  also the audit trail; never overwrite it on sync.
- Devices fetch changes since a cursor the server gives out (a counter it alone increases), not
  since a time, so a record that arrives late with an old device time is still picked up.
- A change the server refuses (no access any more, a field that fails a check) comes back with
  its id and an error code (PRD R9.1), and the device shows it to the person who made it. A
  refused change is never only dropped from the outbox.

## Checklist for a new table that syncs

- [ ] `id TEXT PRIMARY KEY`, made on the device (UUID v7); no auto-increment.
- [ ] Numbers people read in their own column, given by the server (or `device code + counter`
      if they must exist offline), with a unique index, never the key.
- [ ] Each field marked "later wins" or "keep both and raise a conflict".
- [ ] Clashes between different records (duplicates, double booking) found by a check after
      sync that flags them, not by a unique index that refuses them.
- [ ] `created_by`, `updated_by`, device, device time, server time, `deleted_at`.
- [ ] A contract test where two offline devices each create a record, and both sync in either
      order and both twice: two records, both kept, ids unchanged.
