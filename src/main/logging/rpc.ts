export function wrapRequestHandlers<T extends object>(
  handlers: T,
  onError: (method: string, caught: unknown) => void,
): T {
  return new Proxy(handlers, {
    get(target, property, receiver) {
      const handler = Reflect.get(target, property, receiver) as unknown
      if (typeof handler !== 'function') return handler

      return async (...args: unknown[]) => {
        try {
          return await Reflect.apply(handler, target, args)
        } catch (caught) {
          try {
            onError(String(property), caught)
          } catch {
            // Error reporting must not replace the original RPC failure.
          }
          throw caught
        }
      }
    },
  })
}
