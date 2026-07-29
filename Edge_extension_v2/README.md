# Ticket Autofill V2

This is the automatic test version of the ServiceDesk autofill extension.
The original extension remains in `Edge_extension`.

## Install

1. Open `edge://extensions` or `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select the `Edge_extension_v2` folder.

## Compare V1 and V2

Enable only one Ticket Autofill extension at a time. Both versions target the
same ServiceDesk page, so enabling both would make both content scripts react
to the same form.

1. Disable V1 and enable **Ticket Autofill V2 - Automatic**.
2. Refresh the ServiceDesk ticket form.
3. Load the ticket JSON from the V2 panel.
4. Watch the automatic fill progress.
5. Use **Retry** if ServiceDesk renders additional fields later.

V2 fills normal text and rich-text fields as soon as they exist. Select2
dropdowns are opened, searched, and selected sequentially so dependent fields
such as Category, Subcategory, and Item do not overwrite one another.

The original click/focus behavior remains available as a fallback for any field
that ServiceDesk does not expose in time for the automatic pass.
