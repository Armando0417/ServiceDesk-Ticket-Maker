# Ticket Autofill Alt

This is the optional automatic version of the ServiceDesk autofill extension.
The standard focus-based extension remains in `Edge_extension`.

## Install

1. Open `edge://extensions` or `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select the `Edge_extension_alt` folder.

## Compare Standard and Alt

Enable only one Ticket Autofill extension at a time. Both versions target the
same ServiceDesk page, so enabling both would make both content scripts react
to the same form.

1. Disable the standard extension and enable **Ticket Autofill Alt - Automatic**.
2. Refresh the ServiceDesk ticket form.
3. Load the ticket JSON from the Alt panel.
4. Watch the automatic fill progress.
5. Use **Retry** if ServiceDesk renders additional fields later.

Alt fills normal text and rich-text fields as soon as they exist. Select2
dropdowns are opened, searched, and selected sequentially so dependent fields
such as Category, Subcategory, and Item do not overwrite one another.

The original click/focus behavior remains available as a fallback for any field
that ServiceDesk does not expose in time for the automatic pass.
