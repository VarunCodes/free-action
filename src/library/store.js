// A small key/value store in IndexedDB (database 'dnd-sheet', object store 'kv'), for the downloaded SRD and
// the user's custom packs, which are too big for localStorage. When IndexedDB is blocked (some private
// windows), reads give undefined and writes give false instead of throwing.
const DATABASE = 'dnd-sheet';
const STORE = 'kv';

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/** The value saved under this key, or undefined if there is none or it can't be read. */
export async function readValue(key) {
    try {
        const database = await openDatabase();
        return await new Promise((resolve, reject) => {
            const request = database.transaction(STORE).objectStore(STORE).get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch {
        return undefined;
    }
}

/** Saves a value under this key. Returns false if it couldn't be saved. */
export async function writeValue(key, value) {
    try {
        const database = await openDatabase();
        await new Promise((resolve, reject) => {
            const transaction = database.transaction(STORE, 'readwrite');
            transaction.objectStore(STORE).put(value, key);
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
        });
        return true;
    } catch {
        return false;
    }
}
