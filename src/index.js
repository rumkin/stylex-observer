class CountMap extends Map {
  increase(key, increment = 1) {
    let value = (this.get(key) || 0) + increment
    this.set(key, value)
    return this
  }
}

function observeClasses(target, callback) {
  const observer = new MutationObserver(mutations => {
    const changes = new CountMap()

    for (const mutation of mutations) {
      switch (mutation.type) {
      case 'attributes': {
        mutation.target.className.split(/\s+/).forEach(v => {
          changes.increase(v, 1)
        })
        if (mutation.oldValue !== null) {
          mutation.oldValue.split(/\s+/).forEach(v => {
            changes.increase(v, -1)
          })
        }
        break
      }
      case 'childList': {
        collectClasses([...mutation.addedNodes].filter(isElement)).forEach(
          (_, name) => {
            changes.increase(name, 1)
          },
        )
        collectClasses([...mutation.removedNodes].filter(isElement)).forEach(
          (_, name) => {
            changes.increase(name, -1)
          },
        )
        break
      }
      default: {
      }
      }
    }

    for (const [name, count] of changes.entries()) {
      if (count === 0) {
        changes.delete(name)
      }
    }

    callback(changes, mutations, observer)
  })

  observer.observe(target, {
    attributes: true,
    childList: true,
    subtree: true,
    attributeFilter: ['class'],
    attributeOldValue: true,
  })

  return observer
}

function isElement(node) {
  return node.nodeType === 1
}

function collectClasses(...args) {
  const classes = new CountMap()
  const dedup = new Map()

  const targets = args.flat(2)
  for (const target of targets) {
    for (const node of [target, ...target.querySelectorAll('*')]) {
      if (node.className) {
        let list
        if (dedup.has(node.className)) {
          list = dedup.get(node.className)
          for (const name of list) {
            classes.increase(name, 1)
          }
        }
        else {
          list = node.className.split(/\s+/)
          dedup.set(node.className, list)
          for (const name of list) {
            classes.set(name, 1)
          }
        }
      }
    }
  }
  return classes
}

function toCssProp(value) {
  return value.replace(/[A-Z]/g, v => `-${v.toLowerCase()}`)
}

function toCssVal(value) {
  if (typeof value === 'number') {
    return `${value}px`
  }
  else {
    return value
  }
}

function toCssRule(selector, props) {
  const propString = []
  for (const [k, v] of Object.entries(props)) {
    propString.push(`${toCssProp(k)}: ${toCssVal(v)}`)
  }
  return `${selector} {${propString.join('; ')}}`
}

function escapeCssClassName(className) {
  return className.replace(/[^A-Za-z0-9_-]/g, v => `\\${v}`)
}

function createStyleEl() {
  const style = document.createElement('style')
  document.head.append(style)
  return style
}

function getElement(el) {
  if (typeof el === 'string') {
    return document.querySelector(el)
  }

  return el
}

export function parseClassName(className) {
  const match = className.match(/^([^:?]+)(:[^?]+)?(\?.+)?$/)
  if (!match) {
    return {
      name: className,
      pseudo: [],
      modifiers: [],
    }
  }
  else {
    const name = match[1]
    const pseudo = match[2] ? match[2].slice(1).split(':') : []
    const modifiers = match[3] ? match[3].slice(1).split('?') : []

    return {
      name,
      pseudo,
      modifiers,
    }
  }
}

function ruleToCss(rule) {
  let className = escapeCssClassName(rule.className)
  for (const pseudoClass of rule.pseudoClass) {
    className += `:${pseudoClass}`
  }

  let css = toCssRule(`.${className}`, rule.props)

  let mediaQuery = [...Object.entries(rule.mediaQuery)]

  if (mediaQuery.length) {
    mediaQuery = mediaQuery
    .map(([k, v]) => {
      if (typeof v === 'boolean') {
        if (v) {
          return toCssProp(k)
        }
        else {
          return null
        }
      }
      else {
        return `(${toCssProp(k)}: ${toCssVal(v)})`
      }
    })
    .filter(v => v !== null)
    .join(' and ')

    if (mediaQuery.length) {
      return `@media ${mediaQuery} { ${css} }`
    }
  }

  return css
}

export class Observer {
  constructor({
    element = document.body,
    pseudoClass = name => name,
    mediaQuery = () => {},
    props = () => {},
    rules = new Map(),
  }) {
    this.element = getElement(element)
    this.createMediaQuery = mediaQuery
    this.createProps = props
    this.createPseudoClass = pseudoClass

    this.rules = rules
    this.usage = null
    this.observer = null
  }

  onChange(changes) {
    for (const [cname, diff] of changes.entries()) {
      if (diff < 0) {
        if (this.usage.has(cname)) {
          this.usage.increase(cname, diff)
          if (this.usage.get(cname) < 1) {
            this.removeRule(cname)
            this.usage.delete(cname)
          }
        }
      }
      else {
        if (this.usage.has(cname)) {
          this.usage.increase(cname, diff)
          continue
        }

        const rule = this.createRule(cname)
        if (!rule) {
          continue
        }
        this.addRule(rule)
        this.usage.set(cname, diff)
      }
    }
  }

  createRule(className) {
    const {name, pseudo, modifiers} = parseClassName(className)

    const props = this.createProps(name)

    if (!props) {
      return
    }

    const mediaQuery = this.convertMediaQuery(modifiers)
    const pseudoClass = this.convertPseudoClass(pseudo)
    return new Rule({
      className,
      props,
      pseudoClass,
      mediaQuery,
    })
  }

  convertMediaQuery(modifiers) {
    const mediaQuery = {}

    for (const modifier of modifiers) {
      const result = this.createMediaQuery(modifier)
      if (result) {
        Object.assign(mediaQuery, result)
      }
    }

    return mediaQuery
  }

  convertPseudoClass(pseudoClasses) {
    return pseudoClasses.map(v => this.createPseudoClass(v))
  }

  addRule(rule) {
    const cname = rule.className
    const {sheet} = this.style
    const index = sheet.cssRules.length
    sheet.insertRule(ruleToCss(rule), index)
    rule.css = sheet.cssRules[index].cssText
    this.rules.set(cname, rule)
  }

  removeRule(cname) {
    const {css} = this.rules.get(cname)
    this.rules.delete(cname)

    const {sheet} = this.style
    for (let i = 0; i < sheet.cssRules.length; i++) {
      if (sheet.cssRules[i].cssText === css) {
        sheet.deleteRule(i)
        break
      }
    }
  }

  get isStarted() {
    return this.observer === null
  }

  start() {
    if (this.observer) {
      throw new Error('Already started')
    }
    this.style = createStyleEl()
    this.usage = new CountMap()
    this.onChange(collectClasses(this.element))
    this.observer = observeClasses(this.element, changes => {
      this.onChange(changes)
    })
  }

  stop() {
    this.observer.disconnect()
    this.observer = null
    this.style.remove()
    this.style = null
    this.usage = null
  }

  toCSS() {
    const arr = []
    for (const rule of this.rules.values()) {
      arr.push(rule.css)
    }
    return arr.join('\n')
  }
}

export class Rule {
  constructor({
    className,
    pseudoClass = {},
    props = {},
    mediaQuery = {},
    css = '',
  } = {}) {
    this.className = className
    this.props = props
    this.pseudoClass = pseudoClass
    this.mediaQuery = mediaQuery
    this.css = css
  }
}
