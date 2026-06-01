// Registry of URLs that react-perfscope itself fetched (source files and their
// source maps, when resolving stack frames). The network collector consults
// this so the tool's own traffic never shows up as one of the app's network
// signals — measuring shouldn't report the measurer.

const selfRequests = new Set<string>()

/** Record that react-perfscope is about to fetch `url`, so the network
 * collector can exclude its resource-timing entry. */
export function markSelfRequest(url: string): void {
  selfRequests.add(url)
}

/** True when `url` was fetched by react-perfscope itself. */
export function isSelfRequest(url: string): boolean {
  return selfRequests.has(url)
}
