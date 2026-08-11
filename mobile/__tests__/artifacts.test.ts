import {
  ArtifactStore,
  shareTextArtifact,
  type ArtifactFileSystem,
  type BinaryArtifact,
} from '../src/services/artifacts';

class FakeBinaryArtifact implements BinaryArtifact {
  private bytes = new Uint8Array();
  constructor(readonly uri: string) {}
  get size() { return this.bytes.length; }
  async write(bytes: Uint8Array) {
    const next = new Uint8Array(this.bytes.length + bytes.length);
    next.set(this.bytes);
    next.set(bytes, this.bytes.length);
    this.bytes = next;
  }
  async read(offset: number, length: number) { return this.bytes.slice(offset, offset + length); }
  async close() {}
}

class FakeFileSystem implements ArtifactFileSystem {
  readonly namespaceUri = 'file:///cache/finova-artifacts';
  readonly files = new Map<string, string>();
  readonly binaryFiles = new Map<string, FakeBinaryArtifact>();
  async createNamespace() {}
  async writeText(name: string, contents: string) {
    const uri = `${this.namespaceUri}/${name}`;
    this.files.set(uri, contents);
    return uri;
  }
  async createBinary(name: string) {
    const artifact = new FakeBinaryArtifact(`${this.namespaceUri}/${name}`);
    this.binaryFiles.set(artifact.uri, artifact);
    return artifact;
  }
  async deleteFile(uri: string) { this.files.delete(uri); this.binaryFiles.delete(uri); }
  async deleteNamespace() { this.files.clear(); this.binaryFiles.clear(); }
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

  it('writes bounded binary artifacts incrementally inside the owned namespace', async () => {
    const fileSystem = new FakeFileSystem();
    const store = new ArtifactStore({ fileSystem, createId: () => '11111111-1111-4111-8111-111111111111' });
    const artifact = await store.createBinary('backup', 'finova');
    await artifact.write(Uint8Array.of(1, 2));
    await artifact.write(Uint8Array.of(3));
    expect(artifact.size).toBe(3);
    expect(await artifact.read(0, 3)).toEqual(Uint8Array.of(1, 2, 3));
    await artifact.close();
    await store.remove(artifact.uri);
    expect(fileSystem.binaryFiles.size).toBe(0);
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
