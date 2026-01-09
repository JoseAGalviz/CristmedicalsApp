import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';
import { API_ENDPOINTS } from '../constants/Config';

// Constantes para claves de AsyncStorage
const ASYNC_STORAGE_KEYS = {
  CLIENTES: 'clientes',
  VISITAS: 'visitas',
  SEGMENTOS: 'segmentos',
  USER_DATA: 'userData',
};

/**
 * Función principal para sincronizar todos los datos de la aplicación.
 * Limpia los datos anteriores, los descarga desde la API, los valida y los guarda en AsyncStorage.
 * @returns {Promise<{success: boolean, error?: string}>} Objeto con el resultado de la operación.
 */
export async function syncAllData() {
  try {
    // 1. Limpiar datos antiguos
    console.log('🔄 Limpiando datos de caché...');
    await Promise.all(
      Object.values(ASYNC_STORAGE_KEYS).map(key => {
        // Excluimos 'userData' de la limpieza para mantener la sesión
        if (key !== ASYNC_STORAGE_KEYS.USER_DATA) {
          return AsyncStorage.removeItem(key);
        }
        return Promise.resolve();
      })
    );

    // 2. Cargar datos de usuario y segmentos
    const userDataStr = await AsyncStorage.getItem(ASYNC_STORAGE_KEYS.USER_DATA);
    const userData = userDataStr ? JSON.parse(userDataStr) : {};
    const userSegments = userData.segmentos || [];
    console.log(`✅ Segmentos de usuario cargados: ${userSegments.join(', ')}`);

    // 3. Preparar peticiones en paralelo
    let clientesQuery = "";
    if (userSegments.length > 0) {
      clientesQuery = `?co_seg=${userSegments.join(',')}`;
    }

    // Ejecutar peticiones en paralelo
    const [clientesResponse, segmentosData] = await Promise.all([
      api.get(`${API_ENDPOINTS.CLIENTES_GESTIONES}${clientesQuery}`),
      api.get(API_ENDPOINTS.CLIENTES_SEGMENTOS)
    ]);

    // Procesar Clientes
    const clientesGestiones = Array.isArray(clientesResponse.gestiones) ? clientesResponse.gestiones : [];
    if (clientesGestiones.length === 0) {
      console.warn('⚠️ Lista de clientes (gestiones) vacía.');
    }
    await AsyncStorage.setItem(ASYNC_STORAGE_KEYS.CLIENTES, JSON.stringify(clientesGestiones));
    console.log(`✅ ${clientesGestiones.length} clientes (gestiones) sincronizados.`);

    const clientesBitrix = Array.isArray(clientesResponse.bitrix) ? clientesResponse.bitrix : [];
    await AsyncStorage.setItem('clientes_bitrix', JSON.stringify(clientesBitrix));
    console.log(`✅ ${clientesBitrix.length} clientes (bitrix) sincronizados.`);

    // Procesar Segmentos
    if (!Array.isArray(segmentosData) || segmentosData.length === 0) {
      console.warn('⚠️ Lista de segmentos vacía.');
    }
    await AsyncStorage.setItem(ASYNC_STORAGE_KEYS.SEGMENTOS, JSON.stringify(segmentosData));
    console.log(`✅ ${segmentosData.length} segmentos sincronizados.`);

    return { success: true };
  } catch (error) {
    console.error(`❌ Error durante la sincronización: ${error.message}`);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}