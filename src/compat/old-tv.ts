import './old-tv.css'

document.documentElement.classList.add('old-tv')

// ES polyfills come from plugin-legacy. These DOM APIs are not covered by it.
if (!Element.prototype.closest) {
  Element.prototype.closest = function (selector: string): Element | null {
    return findClosest(this, selector)
  }
}

function findClosest(element: Element | null, selector: string): Element | null {
  while (element) {
    if (element.matches(selector)) return element
    element = element.parentElement
  }
  return null
}

if (!('isConnected' in Node.prototype)) {
  Object.defineProperty(Node.prototype, 'isConnected', {
    configurable: true,
    get(this: Node) { return this.ownerDocument?.documentElement.contains(this) ?? false },
  })
}

if (!('key' in KeyboardEvent.prototype)) {
  const keys: Record<number, string> = { 9: 'Tab', 13: 'Enter', 27: 'Escape', 32: ' ', 37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown' }
  Object.defineProperty(KeyboardEvent.prototype, 'key', {
    configurable: true,
    get(this: KeyboardEvent) { return keys[this.keyCode] ?? '' },
  })
}
