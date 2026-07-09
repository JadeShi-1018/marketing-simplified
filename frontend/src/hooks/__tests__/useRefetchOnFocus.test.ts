/**
 * useRefetchOnFocus – unit tests
 */


import { renderHook} from '@testing-library/react';
import { useRefetchOnFocus } from '../useRefetchOnFocus';

describe('useRefetchOnFocus', () => {
    let load: jest.Mock;

    beforeEach(() => {
        load = jest.fn();
    });

    it('should call load when window is focused', () => {
        renderHook(() => useRefetchOnFocus(true, true, true, load));
        window.dispatchEvent(new Event('focus'));
        expect(load).toHaveBeenCalled();
    });

    it('should not call load on focus when hasHydrated is false', () => {
        renderHook(() => useRefetchOnFocus(false, true, true, load));
        window.dispatchEvent(new Event('focus'));
        expect(load).not.toHaveBeenCalled();
    });

    it('should not call load on focus when initialized is false', () => {
        renderHook(() => useRefetchOnFocus(true, false, true, load));
        window.dispatchEvent(new Event('focus'));
        expect(load).not.toHaveBeenCalled();
    });

    it('should not call load on focus when isAuthenticated is false', () => {
        renderHook(() => useRefetchOnFocus(true, true, false, load));
        window.dispatchEvent(new Event('focus'));
        expect(load).not.toHaveBeenCalled();
    });

    it('should not call load on focus after the component unmounts', () => {
        const { unmount } = renderHook(() => useRefetchOnFocus(true, true, true, load));
        unmount();
        window.dispatchEvent(new Event('focus'));
        expect(load).not.toHaveBeenCalled();
    });

    it('should call load once per focus event, not accumulate listeners across rerenders', () => {
        const { rerender } = renderHook(
            ({ load }) => useRefetchOnFocus(true, true, true, load),
            { initialProps: { load } }
        );
        rerender({ load });
        window.dispatchEvent(new Event('focus'));
        expect(load).toHaveBeenCalledTimes(1);
    });
});
