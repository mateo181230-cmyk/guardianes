// ============================================================
// offline-sync.js — Guardianes Colombia
// Sistema de sincronización offline con IndexedDB
// ============================================================

const DB_NAME = 'guardianes-offline-db';
const DB_VERSION = 1;
const STORE_NAME = 'pending-actions';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB límite

// ============================================================
// 1. INICIALIZAR IndexedDB
// ============================================================
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };

        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

// ============================================================
// 2. GUARDAR ACCIÓN OFFLINE
// ============================================================
async function saveActionOffline(actionData) {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);

            const entry = {
                userId: actionData.userId,
                tipo: actionData.tipo,
                puntos: actionData.puntos,
                fileName: actionData.fileName || null,
                fileType: actionData.fileType || null,
                fileBlob: actionData.fileBlob || null,
                timestamp: new Date().toISOString()
            };

            const request = store.add(entry);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('[OfflineSync] Error guardando acción offline:', error);
        throw error;
    }
}

// ============================================================
// 3. OBTENER ACCIONES PENDIENTES
// ============================================================
async function getPendingActions() {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('[OfflineSync] Error leyendo acciones pendientes:', error);
        return [];
    }
}

// ============================================================
// 4. ELIMINAR ACCIÓN SINCRONIZADA
// ============================================================
async function deleteAction(id) {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('[OfflineSync] Error eliminando acción:', error);
    }
}

// ============================================================
// 5. SINCRONIZAR ACCIONES PENDIENTES
// ============================================================
async function syncPendingActions() {
    if (!navigator.onLine) return;

    const pending = await getPendingActions();
    if (pending.length === 0) return;

    console.log(`[OfflineSync] Sincronizando ${pending.length} acciones pendientes...`);
    updateSyncBadge(pending.length, true); // Mostrar "Sincronizando..."

    let syncedCount = 0;

    for (const action of pending) {
        try {
            let evidenceUrl = null;

            // Subir archivo si existe
            if (action.fileBlob && action.fileName) {
                const fileName = `${action.userId}-${Date.now()}-${action.fileName}`;
                const file = new File([action.fileBlob], action.fileName, { type: action.fileType });

                const { error: uploadError } = await supabaseApp.storage
                    .from('evidences')
                    .upload(fileName, file);

                if (uploadError) {
                    console.error('[OfflineSync] Error subiendo archivo:', uploadError);
                    continue; // Saltar esta acción, se reintentará después
                }

                const { data } = supabaseApp.storage.from('evidences').getPublicUrl(fileName);
                evidenceUrl = data.publicUrl;
            }

            // Insertar registro en tabla acciones
            const { error: insertError } = await supabaseApp.from('acciones').insert({
                codigo_voluntario: action.userId,
                tipo: action.tipo,
                puntos: action.puntos,
                evidencia_url: evidenceUrl
            });

            if (insertError) {
                console.error('[OfflineSync] Error insertando acción:', insertError);
                continue;
            }

            // Éxito: eliminar de IndexedDB
            await deleteAction(action.id);
            syncedCount++;
            console.log(`[OfflineSync] Acción sincronizada: ${action.tipo} (+${action.puntos} pts)`);

        } catch (error) {
            console.error('[OfflineSync] Error sincronizando acción:', error);
        }
    }

    // Actualizar badge
    const remaining = await getPendingActions();
    updateSyncBadge(remaining.length, false);

    if (syncedCount > 0) {
        showSyncToast(`✅ ${syncedCount} acción(es) sincronizada(s) exitosamente`);
        // Recargar feed si estamos en la página de acciones
        if (typeof cargarFeed === 'function') {
            cargarFeed();
        }
    }
}

// ============================================================
// 6. UI — Badge de acciones pendientes
// ============================================================
function updateSyncBadge(count, isSyncing) {
    let badge = document.getElementById('offline-sync-badge');

    if (count === 0 && !isSyncing) {
        if (badge) badge.style.display = 'none';
        return;
    }

    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'offline-sync-badge';
        badge.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            z-index: 9999;
            padding: 8px 16px;
            text-align: center;
            font-size: 12px;
            font-weight: 700;
            transition: all 0.3s ease;
            max-width: 448px;
            margin: 0 auto;
        `;
        document.body.prepend(badge);
    }

    badge.style.display = 'block';

    if (isSyncing) {
        badge.style.background = '#0A3572';
        badge.style.color = 'white';
        badge.innerHTML = `<i class="fa-solid fa-sync fa-spin" style="margin-right:6px"></i>Sincronizando ${count} acción(es)...`;
    } else {
        badge.style.background = '#F1A42A';
        badge.style.color = '#0A3572';
        badge.innerHTML = `<i class="fa-solid fa-cloud-arrow-up" style="margin-right:6px"></i>${count} acción(es) pendiente(s) — se enviarán con internet`;
    }
}

// ============================================================
// 7. UI — Toast de confirmación
// ============================================================
function showSyncToast(message) {
    let toast = document.getElementById('sync-toast');

    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'sync-toast';
        toast.style.cssText = `
            position: fixed;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            background: #16a34a;
            color: white;
            padding: 10px 20px;
            border-radius: 24px;
            font-size: 12px;
            font-weight: 700;
            z-index: 9999;
            transition: opacity 0.3s;
            box-shadow: 0 4px 16px rgba(0,0,0,0.2);
            max-width: 90%;
            text-align: center;
        `;
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.opacity = '1';
    toast.style.display = 'block';

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => { toast.style.display = 'none'; }, 300);
    }, 4000);
}

// ============================================================
// 8. VERIFICAR TAMAÑO DE ARCHIVO
// ============================================================
function isFileSizeValid(file) {
    if (file && file.size > MAX_FILE_SIZE) {
        alert(`El archivo es demasiado grande (${(file.size / 1024 / 1024).toFixed(1)}MB). El máximo es 50MB.`);
        return false;
    }
    return true;
}

// ============================================================
// 9. CONVERTIR ARCHIVO A BLOB para IndexedDB
// ============================================================
function fileToBlob(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(new Blob([reader.result], { type: file.type }));
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

// ============================================================
// 10. INICIALIZACIÓN — Listeners automáticos
// ============================================================
async function initOfflineSync() {
    // Escuchar cuando vuelva internet
    window.addEventListener('online', () => {
        console.log('[OfflineSync] Internet detectado — iniciando sincronización...');
        syncPendingActions();
    });

    // Escuchar mensajes del Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', event => {
            if (event.data && event.data.type === 'SYNC_ACCIONES') {
                syncPendingActions();
            }
        });
    }

    // Verificar si hay acciones pendientes al cargar
    const pending = await getPendingActions();
    if (pending.length > 0) {
        updateSyncBadge(pending.length, false);
        // Si hay internet, intentar sincronizar inmediatamente
        if (navigator.onLine) {
            syncPendingActions();
        }
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', initOfflineSync);
