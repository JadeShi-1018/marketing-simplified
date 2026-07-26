import {
  clearSheetRevision,
  getSheetRevision,
  setSheetRevision,
  withBaseRevision,
} from '@/lib/sheetRevisionStore';


describe('sheetRevisionStore', () => {
  afterEach(() => {
    clearSheetRevision(42);
  });

  it('adds the latest known base revision without moving backwards', () => {
    expect(withBaseRevision(42, { operation: 'set' })).toEqual({
      operation: 'set',
    });

    setSheetRevision(42, 3);
    setSheetRevision(42, 2);
    expect(getSheetRevision(42)).toBe(3);
    expect(withBaseRevision(42, { operation: 'set' })).toEqual({
      operation: 'set',
      base_revision: 3,
    });

    setSheetRevision(42, 4);
    expect(getSheetRevision(42)).toBe(4);
  });
});
