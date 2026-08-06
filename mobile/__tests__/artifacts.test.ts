import { ArtifactStore, shareTextArtifact, type ArtifactFileSystem } from '../src/services/artifacts';

class FakeFileSystem implements ArtifactFileSystem {
  readonly namespaceUri = 'file:///cache/finova-artifacts';
  readonly files = new Map<string, string>();
  async createNamespace() {}
  async writeText(name: string, contents: string) {
    const uri = `${this.namespaceUri}/${name}`;
    this.files.set(uri, contents);
    return uri;
  }
  async deleteFile(uri: string) { this.files.delete(uri); }
  async deleteNamespace() { this.files.clear(); }
  owns(uri: string) { return uri.startsWith(`${this.namespaceUri}/`) && !uri.slice(this.namespaceUri.length + 1).includes('/'); }
}

describe('owned export artifacts', () => {
  it('creates only direct owned files and can remove the namespace', async () => {
    const fileSystem = new FakeFileSystem();
    const store = new ArtifactStore({ fileSystem, createId: () => '11111111-1111-4111-8111-111111111111' });
    const uri = await store.createText('backup', 'json', '{}');
    expect(fileSystem.owns(uri)).toBe(true);
    await store.cleanupAll();
    expect(fileSystem.files.size).toBe(0);
  });

  it('always removes a shared file when the share sheet returns', async () => {
    const fileSystem = new FakeFileSystem();
    const store = new ArtifactStore({ fileSystem });
    const sharing = { isAvailableAsync: async () => true, shareAsync: jest.fn(async () => {}) };
    await expect(shareTextArtifact(store, sharing, 'transactions', 'csv', 'a,b', 'text/csv')).resolves.toEqual({
      sheetOpened: true,
      deliveryConfirmed: false,
    });
    expect(fileSystem.files.size).toBe(0);
  });

  it('cleans up after sharing failure', async () => {
    const fileSystem = new FakeFileSystem();
    const store = new ArtifactStore({ fileSystem });
    const sharing = { isAvailableAsync: async () => true, shareAsync: async () => { throw new Error('cancelled'); } };
    await expect(shareTextArtifact(store, sharing, 'backup', 'json', '{}', 'application/json')).rejects.toThrow('not completed');
    expect(fileSystem.files.size).toBe(0);
  });
});
