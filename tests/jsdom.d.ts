/** The slice of jsdom's API the frame specs use (the package ships no types). */
declare module 'jsdom' {
  export interface ConstructorOptions {
    runScripts?: 'dangerously' | 'outside-only'
    pretendToBeVisual?: boolean
    beforeParse?: (window: Window & typeof globalThis) => void
  }
  export class JSDOM {
    constructor(html: string, options?: ConstructorOptions)
    readonly window: Window & typeof globalThis
  }
}
