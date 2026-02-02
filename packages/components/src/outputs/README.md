# Basic idea

Outputs in this folder are built for both the iframe and non-iframe.

🚨 IMPORTANT: do not depend on any LiveStore hooks in this folder like `useQuery`. Components in an iframe don't get access to React Context from the rest of the page.

🚨 IMPORTANT: tailwind styles will not get picked up in the iframe build unless they're targetted directly. See: `iframe-outputs/src/style.css`.

# Thoughts for the future

## Use a React portal and render virtual dom into it

There's a lot of ceremony around supporting multiple bundles because of the iframes. This adds complexity to the codebase. Sending raw HTML strings isn't going to work because that wouldn't address adding complex interactions, and would introduce a difference set of complexity around builds if we went that way.

One idea is to use the iframe as a portal target. Not sure how events would work, and how JS and CSS would get injected. However, if we can send something like a VDOM with all the components to be rendered already resolved, this could help make the iframes much lighter. They would have some hooks to accept vDOM via message passing and then render this vDOM into the iframe. No need to build React components that can work in multiple bundles.

## Keeping memory usage low with light bundles

Ideally, we want to keep iframe code light, or at least make it possible to optimize the weight of the iframe based on the contents. Always loading everything in iframes means that we'd be loading React twice (once in the page and once in the iframe), along with many shared components and libraries.

In the future, optimizing it could look like this:

Different levels of rendering:

- safe: render directly in the parent page
- unsafe but lightweight: minimal HTML/CSS/JS bundle for iframe
- unsafe and heavy: include React, tailwind, etc. iframe

The unsafe and heavy will also limit initial JS sent to the user and dynamically load output types as needed.

SVG and HTML outputs could be unsafe but lightweight.

JSON outputs requires React, so the heavy ouput iframe could be used there. Any interactive components would use the heavy iframe option. But we only need the heavy iframe if other outputs from the cell are unsafe. See below.

## What about multiple outputs for a cell?

If a cell outputs basic `print()` statement along with JSON, the entirety of cell outputs goes into an iframe. Why? Imagine outputs like this:

- JSON
- Plaintext
- JSON

We could safely render the above without an iframe.

Now suppose we add an SVG output:

- JSON
- Plaintext
- JSON
- SVG

We could render the unsafe outputs like so:

- safe (normal React render):
  - JSON: safe
  - Plaintext: safe
  - JSON: safe
- SVG: iframe

What if we have two unsafe outputs sandwiching safe outputs? Iframes can be heavy and we don't want to render too many:

- HTML: iframe
- safe (normal React render):
  - JSON: safe
  - Plaintext: safe
  - JSON: safe
- SVG: iframe

If we want to limit number of iframes, we would output all the content into a single iframe:

heavy iframe (will wrap all):

- HTML
- JSON
- Plaintext
- JSON
- SVG

Because it also renders JSON (which requires React), it will be a heavy iframe.

If the user removes the JSON outputs, the output would be lightweight:

light iframe (will wrap all):

- HTML
- Plaintext
- SVG
