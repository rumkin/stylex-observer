# Stylex Observer

Observe missing CSS classes and generate it according rules on the fly. Stylex can observe
classes used in document and notify about added/removed names. Parse classnames
and separate it into name, pseudo-class and media-query parts. It auto create
missing classes with provided generators (see usage below).

Stylex transforms class names into css classes by parsing it rules.

For example `bg-green:hover?md`, could be used like this:

```html
<div class="bg-green:hover?md">
  Hello, Stylex!
</div>
```

And transformed into this:

```css
@media (min-size: 421px) and (max-size: 720px) {
  .bg-green\:hover\?md {
    background-color: green;
  }
}
```

## Install

```shell
npm i @stylex/observer
```

## Usage

Example:

```js
import {Observer} from '@stylex/observer'

const observer = new Observer({
  // Transform property name
  props: (name) => {
    switch (name) {
      case 'font-red':
        return {color: 'red'}
      case 'font-black':
        return {color: 'black'}
      case 'underline':
        return {textDecoration: 'underline'}
      }
    }
  },
  // Transform pseudo class
  pseudoClass: (name) => {
    switch (name) {
      case 'h':
        return 'hover'
      case 'f':
        return 'focus'
      default:
        return name
    }
  },
  // Transform media query
  mediaQuery: (name) => {
    switch (name) {
      case 'dark':
        return {prefersColorScheme: 'dark'}
      case 'light':
        return {prefersColorScheme: 'dark'}
      default:
        return
    }
  },
})
```

Then insert into body the next HTML:

```html
<div class="color-red?dark color-black?light">
  <a class="underline:h" href="#">Link</a>
</div>
```

## License

MIT © [Rumkin](https://rumk.in)
