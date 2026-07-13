/**
 * SSR safety test: importing stores in a Node environment (no window/localStorage)
 * must not throw. This guards against accidental direct localStorage access at
 * module-init time.
 *
 * @jest-environment node
 */

it('importing authStore in Node (no window) does not throw', () => {
  expect(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@/lib/authStore');
  }).not.toThrow();
});

it('importing projectStore in Node (no window) does not throw', () => {
  expect(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@/lib/projectStore');
  }).not.toThrow();
});
