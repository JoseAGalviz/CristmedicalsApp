import React, { useState, useEffect, useCallback } from 'react';
import { 
  Text, 
  View, 
  StyleSheet, 
  ActivityIndicator, 
  Modal, 
  ScrollView, 
  TouchableOpacity, 
  Alert, 
  TextInput,
  Dimensions,
  Platform,
  FlatList,
  RefreshControl
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useIsFocused } from '@react-navigation/native';

// Constantes y utilidades
const API_BASE_URL = 'https://98.94.185.164.nip.io/api';
const { width, height } = Dimensions.get('window');
const isSmallDevice = width < 375;
const FACTURAS_LIMITE = 500; // Límite máximo de facturas a almacenar

// Utilidades para cálculo de días de crédito y fechas
const calcularDiasCredito = (factura) => {
  let diasCredito = 0;
  
  if (factura.dias_credito != null) {
    const match = String(factura.dias_credito).match(/\d+/);
    diasCredito = match ? Number(match[0]) : 0;
  }
  
  if (diasCredito === 0 && factura.tipo) {
    const tipoMatch = String(factura.tipo).match(/\d+/);
    diasCredito = tipoMatch ? Number(tipoMatch[0]) : 0;
  }
  
  return diasCredito;
};

const calcularFechas = (diasCredito) => {
  const hoy = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  
  const fechaEscaneo = `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())} ${pad(hoy.getHours())}:${pad(hoy.getMinutes())}:${pad(hoy.getSeconds())}`;
  
  const fechaVencimiento = new Date(hoy);
  fechaVencimiento.setDate(fechaVencimiento.getDate() + diasCredito);
  const fecVencDespues = fechaVencimiento.toISOString().substring(0, 10);
  
  return { fechaEscaneo, fecVencDespues };
};

// Componente para mostrar filas en el modal
const ModalRow = ({ label, value }) => (
  <View style={styles.modalRow}>
    <Text style={styles.modalRowLabel}>{label}:</Text>
    <Text style={styles.modalRowValue} numberOfLines={1} ellipsizeMode="tail">{value}</Text>
  </View>
);

// Componente para ítem de factura en la lista
const FacturaItem = ({ factura }) => (
  <View style={styles.facturaItem}>
    <Text style={styles.facturaNumero}>#{factura.fact_num}</Text>
    <Text style={styles.facturaDescripcion} numberOfLines={1} ellipsizeMode="tail">
      {factura.cli_des}
    </Text>
    <Text style={styles.facturaDetalle}>
      Fecha escaneo: {factura.fecha_escaneo || 'N/D'}
    </Text>
    <Text style={styles.facturaDetalle}>
      Vence: {factura.fec_venc_despues || 'N/D'}
    </Text>
    <Text style={styles.facturaDetalle} numberOfLines={1} ellipsizeMode="tail">
      Coordenadas: {factura.coordenadas || 'N/D'}
    </Text>
  </View>
);

// Componente para el modal de facturas guardadas con scroll adecuado
const FacturasModal = ({ visible, onClose, facturasLocales }) => {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  }, []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackground}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>
            Facturas guardadas ({facturasLocales.length})
          </Text>
          <View style={styles.modalDivider} />

          {facturasLocales.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No hay facturas guardadas</Text>
            </View>
          ) : (
            <View style={{ maxHeight: 300, marginBottom: 10 }}>
              <FlatList
                data={facturasLocales}
                renderItem={({ item }) => <FacturaItem factura={item} />}
                keyExtractor={(item, index) => `${item.fact_num}-${index}`}
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
                style={{ flexGrow: 0 }}
                contentContainerStyle={styles.facturasListContent}
                initialNumToRender={10}
                maxToRenderPerBatch={5}
                windowSize={10}
                removeClippedSubviews={true}
              />
            </View>
          )}

          <TouchableOpacity
            style={[styles.modalButton, styles.modalCloseButton]}
            onPress={onClose}
            activeOpacity={0.85}
          >
            <Text style={styles.modalButtonText}>Cerrar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// Función para limpiar facturas antiguas automáticamente
const limpiarFacturasAntiguas = async () => {
  try {
    const stored = await AsyncStorage.getItem('facturas');
    if (!stored) return;
    
    let facturas = JSON.parse(stored);
    const hoy = new Date();
    
    // Filtrar facturas con más de 7 días
    const facturasFiltradas = facturas.filter(f => {
      if (!f.fecha_escaneo) return true;
      try {
        const fechaEscaneo = new Date(f.fecha_escaneo);
        const diff = (hoy - fechaEscaneo) / (1000 * 60 * 60 * 24);
        return diff <= 7;
      } catch {
        return false;
      }
    });
    
    // Si aún supera el límite después de filtrar, eliminar las más antiguas
    if (facturasFiltradas.length > FACTURAS_LIMITE) {
      // Ordenar por fecha (más recientes primero)
      facturasFiltradas.sort((a, b) => {
        try {
          const dateA = new Date(a.fecha_escaneo || 0);
          const dateB = new Date(b.fecha_escaneo || 0);
          return dateB - dateA;
        } catch {
          return 0;
        }
      });
      
      // Mantener solo las más recientes
      const facturasLimitadas = facturasFiltradas.slice(0, FACTURAS_LIMITE);
      await AsyncStorage.setItem('facturas', JSON.stringify(facturasLimitadas));
      return facturasLimitadas;
    }
    
    await AsyncStorage.setItem('facturas', JSON.stringify(facturasFiltradas));
    return facturasFiltradas;
  } catch (error) {
    console.error('Error limpiando facturas antiguas:', error);
    return [];
  }
};

export default function FacturasScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [barcode, setBarcode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [facturaData, setFacturaData] = useState(null);
  const [facturasLocales, setFacturasLocales] = useState([]);
  const [error, setError] = useState(null);
  const [manualFactura, setManualFactura] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [comentarioRango, setComentarioRango] = useState('');
  
  // 1. NUEVO ESTADO PARA EL USUARIO LOGUEADO
  const [currentUserCoVend, setCurrentUserCoVend] = useState(null);
  
  const isFocused = useIsFocused();

  // 2. NUEVO EFECTO PARA CARGAR EL USUARIO LOGUEADO AL INICIAR
  useEffect(() => {
    const loadUserData = async () => {
      try {
        const userDataStr = await AsyncStorage.getItem('userData');
        if (userDataStr) {
          const userData = JSON.parse(userDataStr);
          // Asumimos que el objeto userData tiene la propiedad co_ven
          // Si tu objeto usa 'id' o 'codigo', cambia 'co_ven' por esa propiedad
          if (userData.co_ven) {
            setCurrentUserCoVend(userData.co_ven);
            console.log("Usuario logueado cargado:", userData.co_ven);
          }
        }
      } catch (e) {
        console.error("Error cargando datos de usuario", e);
      }
    };
    loadUserData();
  }, []);

  // Cargar facturas locales con limpieza automática
  const cargarFacturasLocales = useCallback(async () => {
    try {
      const facturasFiltradas = await limpiarFacturasAntiguas();
      setFacturasLocales(facturasFiltradas || []);
    } catch {
      setFacturasLocales([]);
    }
  }, []);

  useEffect(() => {
    if (isFocused) {
      cargarFacturasLocales();
    }
  }, [isFocused, cargarFacturasLocales]);

  // Obtener coordenadas del dispositivo
  const obtenerCoordenadas = useCallback(async () => {
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso de ubicación denegado');
        return null;
      }
      
      const lastLocation = await Location.getLastKnownPositionAsync();
      if (lastLocation) {
        return `${lastLocation.coords.latitude},${lastLocation.coords.longitude}`;
      }
      
      const locationPromise = Location.getCurrentPositionAsync({});
      const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 7000));
      const location = await Promise.race([locationPromise, timeoutPromise]);
      
      if (!location) {
        Alert.alert('No se pudo obtener la ubicación a tiempo');
        return null;
      }
      
      return `${location.coords.latitude},${location.coords.longitude}`;
    } catch {
      return null;
    }
  }, []);

  // Guardar factura local con coordenadas y fechas
  const guardarFacturaLocal = useCallback(async (factura) => {
    try {
      const diasCredito = calcularDiasCredito(factura);
      const { fechaEscaneo, fecVencDespues } = calcularFechas(diasCredito);
      
      const facturaActualizada = {
        ...factura,
        dias_credito: diasCredito,
        fecha_escaneo: fechaEscaneo,
        fec_venc_despues: fecVencDespues,
        // 3. AQUÍ REEMPLAZAMOS EL VENDEDOR
        // Si existe el usuario logueado, lo usa. Si no, mantiene el original.
        co_ven: currentUserCoVend || factura.co_ven 
      };
      
      const coords = await obtenerCoordenadas();
      if (!coords) {
        Alert.alert('No se pudo obtener la ubicación. No se puede guardar/enviar la factura.');
        return false;
      }
      
      facturaActualizada.coordenadas = coords;

      const stored = await AsyncStorage.getItem('facturas');
      let facturas = stored ? JSON.parse(stored) : [];
      
      // Verificar si la factura ya existe
      if (facturas.some(f => String(f.fact_num) === String(facturaActualizada.fact_num))) {
        Alert.alert('Esta factura ya fue registrada localmente.');
        return false;
      }
      
      // Limitar el número máximo de facturas
      if (facturas.length >= FACTURAS_LIMITE) {
        // Eliminar la factura más antigua
        facturas.sort((a, b) => {
          try {
            const dateA = new Date(a.fecha_escaneo || 0);
            const dateB = new Date(b.fecha_escaneo || 0);
            return dateA - dateB;
          } catch {
            return 0;
          }
        });
        
        facturas = facturas.slice(1);
        Alert.alert('Límite de facturas alcanzado', `Se eliminó la factura más antigua.`);
      }
      
      facturas.push(facturaActualizada);
      await AsyncStorage.setItem('facturas', JSON.stringify(facturas));
      setFacturasLocales(facturas);
      console.log('Guardando factura con vendedor:', facturaActualizada.co_ven);
      return true;
    } catch {
      Alert.alert('Error guardando factura.');
      return false;
    }
  }, [obtenerCoordenadas, currentUserCoVend]); // Agregamos currentUserCoVend a dependencias

  // Marcar factura como enviada
  const marcarFacturaComoEnviada = useCallback(async (factNum) => {
    try {
      const stored = await AsyncStorage.getItem('facturasEnviadas');
      let facturasEnviadas = stored ? JSON.parse(stored) : [];
      
      if (!facturasEnviadas.includes(String(factNum))) {
        facturasEnviadas.push(String(factNum));
        await AsyncStorage.setItem('facturasEnviadas', JSON.stringify(facturasEnviadas));
      }
    } catch (error) {
      console.error('Error marcando factura como enviada:', error);
    }
  }, []);

  // Consultar factura en el servidor
  const consultarFactura = useCallback(async (numFactura) => {
    try {
      const payload = { num_factura: numFactura };
      const response = await fetch(`${API_BASE_URL}/facturas/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const text = await response.text();
      console.log('Status:', response.status);
      console.log('Response:', text);

      let result;
      try {
        result = JSON.parse(text);
      } catch {
        result = null;
      }

      if (result && result.error === "Factura ya escaneada previamente.") {
        Alert.alert('Factura ya escaneada previamente.');
        return null;
      }

      if (response.status === 404 && text.includes('No se encontró la factura')) {
        Alert.alert('Factura no encontrada');
        return null;
      }

      if (!response.ok) {
        Alert.alert('Error', 'No se pudo consultar la factura. Verifica tu conexión o intenta más tarde.');
        throw new Error('No se pudo consultar la factura. Verifica tu conexión o intenta más tarde.');
      }

      return result;
    } catch (error) {
      console.error('Error consultando factura:', error);
      // Ya mostraste la alerta arriba, aquí solo relanza el error si quieres
      throw error;
    }
  }, []);

  // Verifica si la factura ya está guardada/enviada
  const facturaYaRegistrada = useCallback((factNum) => {
    if (facturasLocales.some(f => String(f.fact_num) === String(factNum))) {
      return true;
    }
    // Opcional: verifica también en facturasEnviadas si usas ese array
    return false;
  }, [facturasLocales]);

  // Escaneo de código de barras
  const handleBarCodeScanned = useCallback(async ({ data }) => {
    if (facturaYaRegistrada(data)) {
      Alert.alert('Esta factura ya fue registrada, no puede ser escaneada.');
      setScanned(false);
      setBarcode(null);
      setFacturaData(null);
      setLoading(false);
      return;
    }
    setScanned(true);
    setBarcode(data);
    setLoading(true);
    setError(null);

    try {
      const result = await consultarFactura(data);

      if (!result) {
        setLoading(false);
        setTimeout(() => {
          setScanned(false);
          setBarcode(null);
        }, 500);
        return;
      }

      setFacturaData(result);
    } catch (error) {
      setError(error.message);
      setFacturaData(null);
      setLoading(false);
      setScanned(false);
      setBarcode(null);
    }
  }, [consultarFactura, facturaYaRegistrada]);

  // Confirmar y guardar factura escaneada
  const confirmarGuardarFactura = useCallback(async () => {
    setLoading(true);
    const ok = await guardarFacturaLocal(facturaData);
    setLoading(false);
    
    if (ok) {
      Alert.alert('Factura registrada localmente con éxito.');
      setScanned(false);
      setBarcode(null);
      setFacturaData(null);
      cargarFacturasLocales();
    }
  }, [facturaData, guardarFacturaLocal, cargarFacturasLocales]);

  // Enviar factura al servidor
  const enviarFactura = useCallback(async (facturaData, comentario) => {
    try {
      const payloadUpdate = {
        fact_num: [String(facturaData.fact_num)],
        fec_venc_despues: [facturaData.fec_venc_despues],
      };
      
      const responseUpdate = await fetch(`${API_BASE_URL}/facturas/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadUpdate),
      });

      // Envía los datos de la factura escaneada
      const facturaPayload = [{
        fact_num: facturaData.fact_num,
        co_cli: facturaData.co_cli,
        cli_des: facturaData.cli_des,
        tipo: facturaData.tipo,
        dias_credito: facturaData.dias_credito ?? 0,
        fec_emis: facturaData.fec_emis,
        fec_venc_antes: facturaData.fec_venc_antes,
        fec_venc_despues: facturaData.fec_venc_despues,
        fecha_escaneo: facturaData.fecha_escaneo,
        // 4. AQUÍ REEMPLAZAMOS EL VENDEDOR TAMBIÉN AL ENVIAR
        co_ven: currentUserCoVend || facturaData.co_ven,
        co_zon: facturaData.co_zon,
        zon_des: facturaData.zon_des,
        co_seg: facturaData.co_seg,
        seg_des: facturaData.seg_des,
        coordenadas: facturaData.coordenadas,
        comentario_rango: facturaData.estado_rango === "FUERA DE RANGO" ? comentario.trim() : "",
      }];
      
      console.log("Enviando payload con vendedor:", facturaPayload[0].co_ven);

      const responseLocales = await fetch(`${API_BASE_URL}/facturas_locales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facturas: facturaPayload }),
      });

      return responseUpdate.ok && responseLocales.ok;
    } catch (error) {
      console.error('Error enviando factura:', error);
      return false;
    }
  }, [currentUserCoVend]); // Agregamos currentUserCoVend a dependencias

  // Enviar factura escaneada
  const enviarFacturaEscaneada = useCallback(async () => {
    if (!facturaData) return;
    if (facturaYaRegistrada(facturaData.fact_num)) {
      Alert.alert('Esta factura ya fue registrada.');
      setLoading(false);
      return;
    }
    setLoading(true);
    
    try {
      // Verifica coordenadas antes de enviar
      if (!facturaData.coordenadas) {
        const coords = await obtenerCoordenadas();
        if (!coords) {
          Alert.alert('No se pudo obtener la ubicación. No se puede enviar la factura.');
          setLoading(false);
          return;
        }
        facturaData.coordenadas = coords;
      }

      const success = await enviarFactura(facturaData, comentarioRango);
      
      if (success) {
        await marcarFacturaComoEnviada(facturaData.fact_num);
        // Al guardar localmente después de enviar, también usará el ID correcto gracias al cambio en guardarFacturaLocal
        await guardarFacturaLocal(facturaData); 
        Alert.alert('Factura enviada y guardada correctamente.');
        setScanned(false);
        setBarcode(null);
        setFacturaData(null);
        cargarFacturasLocales();
      } else {
        Alert.alert('Error al enviar la factura.');
      }
    } catch (error) {
      Alert.alert('Error al enviar la factura.');
    } finally {
      setLoading(false);
    }
  }, [facturaData, comentarioRango, enviarFactura, marcarFacturaComoEnviada, guardarFacturaLocal, cargarFacturasLocales, obtenerCoordenadas]);

  // Consultar factura manualmente
  const consultarFacturaManual = useCallback(async () => {
    if (!manualFactura.trim()) {
      Alert.alert('Debes ingresar un número de factura.');
      return;
    }
    if (facturaYaRegistrada(manualFactura.trim())) {
      Alert.alert('Esta factura ya fue registrada.');
      setScanned(false);
      setBarcode(null);
      setFacturaData(null);
      setLoading(false);
      return;
    }
    setScanned(true);
    setBarcode(manualFactura.trim());
    setLoading(true);
    setError(null);

    try {
      const result = await consultarFactura(manualFactura.trim());
      
      if (!result) {
        setLoading(false);
        setTimeout(() => {
          setScanned(false);
          setBarcode(null);
        }, 500);
        return;
      }
      
      setFacturaData(result);
    } catch (error) {
      setError(error.message);
      setFacturaData(null);
    } finally {
      setLoading(false);
    }
  }, [manualFactura, consultarFactura, facturaYaRegistrada]);

  useEffect(() => {
    if (facturaData) {
      setLoading(false);
    }
  }, [facturaData]);

  // UI principal con cámara siempre visible
  if (!permission) {
    return <Text>Solicitando permiso de cámara...</Text>;
  }
  
  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permissionText}>No se concedió acceso a la cámara.</Text>
        <TouchableOpacity style={styles.scanButton} onPress={requestPermission}>
          <Text style={styles.scanButtonText}>Permitir cámara</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Gestión de Facturas</Text>
      <Text style={styles.subtitle}>
        Escanea el código de barras de tu factura para consultar y registrar sus datos.
      </Text>
      
      <View style={styles.cameraContainer}>
        {isFocused && permission?.granted ? (
          <CameraView
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            style={styles.cameraBox}
            facing="back"
          />
        ) : (
          <TouchableOpacity style={styles.scanButton} onPress={requestPermission}>
            <Text style={styles.scanButtonText}>Permitir cámara</Text>
          </TouchableOpacity>
        )}
      </View>
      
      {loading && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#007bff" />
          <Text>Procesando...</Text>
          <TouchableOpacity
            style={[styles.modalButton, styles.closeButton]}
            onPress={() => {
              setLoading(false);
              setScanned(false);
              setBarcode(null);
              setFacturaData(null);
              setError(null);
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.modalButtonText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      )}
      
      {facturaData && (
        <View style={styles.facturaDataContainer}>
          <Text style={styles.cardTitle}>Datos de la Factura</Text>
          <View style={styles.modalDivider} />
          
          {error ? (
            <Text style={styles.modalError}>{error}</Text>
          ) : (
            <View style={styles.modalTable}>
              <ModalRow label="Número" value={facturaData.fact_num} />
              <ModalRow label="Cliente" value={facturaData.co_cli} />
              <ModalRow label="Descripción" value={facturaData.cli_des} />
              <ModalRow label="Tipo" value={facturaData.tipo} />
              <ModalRow label="Emisión" value={facturaData.fec_emis} />
              <ModalRow label="Venc. después" value={facturaData.fec_venc_despues} />
            </View>
          )}
          
          {!error && (
            <>
              <TouchableOpacity
                style={[styles.modalButton, styles.sendButton]}
                onPress={enviarFacturaEscaneada}
                activeOpacity={0.85}
                disabled={loading}
              >
                <Text style={styles.modalButtonText}>Enviar datos</Text>
              </TouchableOpacity>
              
            </>
          )}
          
          {facturaData && facturaData.estado_rango === "FUERA DE RANGO" && (
            <View style={styles.comentarioContainer}>
              <Text style={styles.comentarioLabel}>
                Comentario (requerido por estar fuera de rango):
              </Text>
              <TextInput
                style={styles.comentarioInput}
                placeholder="Escribe el motivo..."
                value={comentarioRango}
                onChangeText={setComentarioRango}
                multiline
                textAlignVertical="top"
              />
            </View>
          )}
          
          <TouchableOpacity
            style={[styles.modalButton, styles.closeButton]}
            onPress={() => {
              setScanned(false);
              setBarcode(null);
              setFacturaData(null);
              setError(null);
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.modalButtonText}>Cerrar</Text>
          </TouchableOpacity>
        </View>
      )}
      
      <View style={styles.buttonGroup}>
        <TouchableOpacity
          style={styles.tableButton}
          onPress={() => {
            if (!facturasLocales.length) {
              Alert.alert('Facturas guardadas', 'No hay facturas guardadas.');
              return;
            }
            setShowModal(true);
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.tableButtonText}>
            Ver facturas guardadas ({facturasLocales.length})
          </Text>
        </TouchableOpacity>
        
        {/* Botón para limpiar facturas manualmente */}
        {facturasLocales.length > 0 && (
          <TouchableOpacity
            style={[styles.tableButton, styles.cleanButton]}
            onPress={async () => {
              Alert.alert(
                'Limpiar facturas',
                `¿Estás seguro de que quieres eliminar todas las facturas guardadas? (${facturasLocales.length} facturas)`,
                [
                  { text: 'Cancelar', style: 'cancel' },
                  { 
                    text: 'Limpiar', 
                    style: 'destructive',
                    onPress: async () => {
                      await AsyncStorage.removeItem('facturas');
                      setFacturasLocales([]);
                      Alert.alert('Facturas eliminadas', 'Todas las facturas han sido eliminadas.');
                    }
                  }
                ]
              );
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.tableButtonText}>Limpiar facturas</Text>
          </TouchableOpacity>
        )}
      </View>
      
      <FacturasModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        facturasLocales={facturasLocales}
      />
      
      <View style={styles.manualInputContainer}>
        <Text style={styles.manualInputLabel}>
          Ingresar factura manualmente
        </Text>
        <View style={styles.manualInputRow}>
          <TextInput
            style={styles.manualInput}
            placeholder="Número de factura"
            value={manualFactura}
            onChangeText={setManualFactura}
            keyboardType="numeric"
            returnKeyType="done"
            editable={!loading}
          />
          <TouchableOpacity
            style={styles.consultButton}
            onPress={consultarFacturaManual}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={styles.consultButtonText}>Consultar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f9fa',
  },
  scrollContent: {
    padding: isSmallDevice ? 16 : 24,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#f7f9fa',
  },
  permissionText: {
    fontSize: 16,
    marginBottom: 16,
    textAlign: 'center',
  },
  title: {
    fontSize: isSmallDevice ? 24 : 28,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#007bff',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: isSmallDevice ? 14 : 16,
    marginBottom: 24,
    color: '#555',
    textAlign: 'center',
    lineHeight: 20,
  },
  scanButton: {
    backgroundColor: '#007bff',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginBottom: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  tableButton: {
    backgroundColor: '#28a745',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  tableButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  // Modal styles
  modalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: isSmallDevice ? 16 : 24,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: isSmallDevice ? 20 : 28,
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  modalTitle: {
    fontSize: isSmallDevice ? 20 : 22,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#007bff',
    alignSelf: 'center',
    textAlign: 'center',
  },
  modalDivider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 10,
  },
  facturasList: {
    flex: 1,
  },
  facturasListContent: {
    paddingBottom: 10,
  },
  facturaItem: {
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  facturaNumero: {
    fontWeight: 'bold',
    color: '#007bff',
    fontSize: 16,
  },
  facturaDescripcion: {
    color: '#333',
    fontSize: 14,
    marginTop: 2,
  },
  facturaDetalle: {
    color: '#555',
    fontSize: 12,
    marginTop: 2,
  },
  emptyState: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
  },
  modalButton: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 1,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  modalCloseButton: {
    backgroundColor: '#888',
  },
  sendButton: {
    backgroundColor: '#17a2b8',
  },
  saveButton: {
    backgroundColor: '#28a745',
  },
  closeButton: {
    backgroundColor: '#888',
  },
  modalButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  modalError: {
    color: 'red',
    marginBottom: 12,
    alignSelf: 'center',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  modalTable: {
    marginBottom: 18,
  },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
    alignItems: 'center',
  },
  modalRowLabel: {
    fontWeight: 'bold',
    color: '#333',
    minWidth: 100,
    fontSize: isSmallDevice ? 14 : 16,
  },
  modalRowValue: {
    color: '#555',
    flex: 1,
    textAlign: 'right',
    fontSize: isSmallDevice ? 14 : 16,
  },
  buttonGroup: {
    width: '100%',
    marginTop: 16,
    marginBottom: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
  },
  cameraBox: {
    width: '100%',
    maxWidth: 400,
    height: isSmallDevice ? 180 : 220,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#007bff',
    backgroundColor: '#222',
  },
  facturaDataContainer: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: isSmallDevice ? 12 : 16,
    marginVertical: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
    borderLeftWidth: 4,
    borderLeftColor: '#007bff',
  },
  cardTitle: {
    fontSize: isSmallDevice ? 18 : 20,
    fontWeight: 'bold',
    color: '#007bff',
    marginBottom: 6,
    textAlign: 'center',
  },
  comentarioContainer: {
    marginTop: 12,
  },
  comentarioLabel: {
    fontWeight: 'bold',
    color: '#d9534f',
    marginBottom: 6,
    fontSize: isSmallDevice ? 14 : 16,
  },
  comentarioInput: {
    borderWidth: 1,
    borderColor: '#d9534f',
    borderRadius: 6,
    padding: 10,
    minHeight: 80,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  manualInputContainer: {
    width: '100%',
    marginBottom: 12,
  },
  manualInputLabel: {
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#007bff',
    fontSize: isSmallDevice ? 14 : 16,
  },
  manualInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  manualInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007bff',
    padding: 10,
    fontSize: 16,
    marginRight: 8,
    minHeight: 44,
  },
  consultButton: {
    backgroundColor: '#007bff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 1,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  consultButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  cleanButton: {
    backgroundColor: '#dc3545',
    marginTop: 10,
  },
});