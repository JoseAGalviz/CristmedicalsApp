import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from "expo-camera";
import { api } from '../services/api'; // Usar nuestro servicio API robusto
import { showMessage } from "react-native-flash-message";
import SoundManager from '../utils/SoundManager';
import { Ionicons } from '@expo/vector-icons';

// --- Constantes ---
const POLL_INTERVAL = 2000; // 2 segundos
const STORAGE_KEYS = {
  GUIAS_GUARDADAS: 'guiasGuardadas', // Deprecated for this flow but kept for legacy
  GUIAS_CARGADAS_VEHICULO: 'guiasCargadasVehiculo',
  ESCANEOS_PREFIX: "escaneos_"
};
const COLORS = {
  primary: "#1A9888",
  success: "#49AF4E",
  warning: "#FFD600",
  error: "#d9534f",
  info: "#007bff",
  white: "#fff",
  lightGray: "#f7f9fa",
  gray: "#888",
  darkGray: "#333",
  border: "#ddd",
  overlay: 'rgba(0,0,0,0.5)'
};

// --- Utilidades ---
const normalizeCode = (val) => {
  if (val === null || val === undefined) return '';
  let str = String(val).trim().toUpperCase();

  // Rule A/B transformation (as previously defined)
  if (/^A\d{7}$/.test(str)) {
    if (str.startsWith("A2")) return "7" + str.slice(1);
    return String(Number(str.slice(1)));
  }
  if (/^B\d{7}$/.test(str)) {
    const serie = str.slice(1);
    return serie < "0050000" ? "8" + serie : "5" + serie;
  }

  // Generic numeric normalization: remove leading zeros
  // But only if it's purely numeric to avoid breaking alphanumeric codes
  if (/^\d+$/.test(str)) {
    return String(Number(str));
  }

  return str;
};

// Use normalized values for keys to ensure stability when backend data changes format
const getItemKey = (item) => {
  const f = normalizeCode(item.factura);
  const n = normalizeCode(item.nota);
  return `${f}_${n}`;
};

// --- Componentes ---

const StatusIcon = ({ status }) => {
  if (status === 'full') return <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />;
  if (status === 'partial') return <Ionicons name="alert-circle" size={24} color={COLORS.warning} />;
  return <Ionicons name="ellipse-outline" size={24} color={COLORS.gray} />;
};

const TableHeader = ({ headers }) => (
  <View style={styles.tableRowHeader}>
    {headers.map((header, index) => (
      <Text key={index} style={styles.tableHeaderCell}>{header}</Text>
    ))}
  </View>
);

const DetailRow = ({ item, escaneo, index }) => {
  // Determinar estatus
  const isFull = escaneo?.factura && escaneo?.nota;
  const isPartial = !isFull && (escaneo?.factura || escaneo?.nota);
  const status = isFull ? 'full' : isPartial ? 'partial' : 'none';

  // Estilo base
  let rowStyle = index % 2 === 0 ? styles.rowEven : styles.rowOdd;
  if (isFull) rowStyle = styles.rowAmbos;
  else if (isPartial) rowStyle = styles.rowUno;

  return (
    <View style={[styles.tableRow, rowStyle]}>
      <View style={{ width: 40, alignItems: 'center', justifyContent: 'center' }}>
        <StatusIcon status={status} />
      </View>
      <Text style={styles.tableCell}>{item.factura} / {item.nota}</Text>
      <Text style={styles.tableCell}>{item.paquetes}</Text>
      <Text style={styles.tableCell}>{item.descrip?.trim()}</Text>
    </View>
  );
};

// --- Pantalla Principal ---
export default function GuiaCargaScreen({ navigation }) {
  // Estados Genéricos
  const [numeroCarga, setNumeroCarga] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Datos de la Guía (Desde API)
  const [guiaData, setGuiaData] = useState(null);

  // Estados de Escaneo (Local)
  const [escaneos, setEscaneos] = useState({});
  const [scanningEnabled, setScanningEnabled] = useState(false); // Toggle Cámara
  const [notaScan, setNotaScan] = useState("");

  // Cámara
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  // Polling
  const [isPolling, setIsPolling] = useState(false);

  // Utilidad Responsiva
  const { width } = useWindowDimensions();
  const isSmallScreen = width < 768;

  // Derived State
  const estatusCarga = useMemo(() => {
    if (guiaData && guiaData.cargado && guiaData.cargado.length > 0) {
      const rawStatus = guiaData.cargado[0].estatus;
      return rawStatus ? String(rawStatus).trim().toUpperCase() : null;
    }
    return null;
  }, [guiaData]);

  const isCargaFinalizada = estatusCarga === 'F';

  // --- Lógica de recuperación de escaneos ---
  const loadSavedScans = useCallback(async (cargaId) => {
    try {
      const saved = await AsyncStorage.getItem(`${STORAGE_KEYS.ESCANEOS_PREFIX}${cargaId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Object.keys(parsed).length > 0) {
          setEscaneos(parsed);
        }
      }
    } catch (error) {
      console.log('Error loading scans', error);
    }
  }, []);

  // --- Lógica de API ---
  const fetchGuia = useCallback(async (num, isBackground = false) => {
    if (!num) return;
    if (!isBackground) {
      setLoading(true);
      setError('');
    }

    try {
      const response = await api.post('/api/guias/buscar-carga', { numeroCarga: Number(num) });
      // Asumiendo que response ya es el objeto data (por api.js)
      // Ajustar estructura según GuiaCargaScreen anterior: response.cargado / response.detalle
      if (response && (response.cargado || response.detalle)) {
        setGuiaData(response);
        // Si es la primera carga (no background), activamos polling y recuperamos escaneos previos
        if (!isBackground) {
          await loadSavedScans(num);
          setIsPolling(true);
        }
      } else {
        if (!isBackground) setError('No se encontraron datos para esta carga.');
      }
    } catch (err) {
      if (!isBackground) setError(err.message || 'Error al buscar la carga.');
      // En background fallamos silenciosamente
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, [loadSavedScans]);

  // --- Efecto Polling ---
  useEffect(() => {
    let interval;
    if (isPolling && numeroCarga) {
      interval = setInterval(() => {
        // Poll en background
        fetchGuia(numeroCarga, true);
      }, POLL_INTERVAL);
    }
    return () => clearInterval(interval);
  }, [isPolling, numeroCarga, fetchGuia]);

  // --- Lógica de Escaneo ---
  const guardarEscaneosLocal = async (nuevosEscaneos) => {
    try {
      await AsyncStorage.setItem(`${STORAGE_KEYS.ESCANEOS_PREFIX}${numeroCarga}`, JSON.stringify(nuevosEscaneos));
    } catch (e) { console.error(e); }
  };

  const limpiarEscaneos = async () => {
    Alert.alert(
      'Confirmar',
      '¿Estás seguro de limpiar todos los escaneos de esta guía?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Limpiar',
          style: 'destructive',
          onPress: async () => {
            setEscaneos({});
            await AsyncStorage.removeItem(`${STORAGE_KEYS.ESCANEOS_PREFIX}${numeroCarga}`);
          }
        }
      ]
    );
  };

  const guardarGuiaFinalizada = async () => {
    if (!guiaData) return;

    try {
      const guiasCargadas = await AsyncStorage.getItem(STORAGE_KEYS.GUIAS_CARGADAS_VEHICULO).then(res => res ? JSON.parse(res) : []) || [];

      const yaExiste = guiasCargadas.some(g => String(g.numeroCarga) === String(numeroCarga));
      if (yaExiste) {
        Alert.alert('Aviso', 'Esta guía ya fue registrada anteriormente.');
        return;
      }

      // --- 1. Preparar Payload Sanitizado ---
      // El backend genera dinámicamente el SQL usando Object.keys() y agregando manualamente 'fecha', 'status', 'id_ca'.
      // Si enviamos esos campos en el objeto, el SQL fallará por columnas duplicadas.
      const forbiddenFields = ['id_ca', 'fecha', 'status', 'estatus'];

      const sanitizeItem = (item) => {
        const clean = { ...item };
        forbiddenFields.forEach(f => delete clean[f]);
        return clean;
      };

      const payloadCargado = (guiaData.cargado || []).map(sanitizeItem);
      const payloadDetalle = (guiaData.detalle || []).map(sanitizeItem);

      // Payload para envío
      const payload = {
        ok: true,
        id_ca: Number(numeroCarga), // Importante: Backend espera coincidencia probable numérica
        detalle: payloadDetalle,
        cargado: payloadCargado
      };

      // Datos para guardado local (Mantenemos todo para referencia)
      const now = new Date();
      const nuevaGuia = {
        numeroCarga,
        cargado: guiaData.cargado || [],
        detalle: guiaData.detalle || [],
        horaGuardado: now.toLocaleTimeString(),
        fechaGuardado: now.toLocaleDateString(),
        timestampGuardado: now.getTime(),
        syncStatus: 'pending' // Flag para sincronización futura
      };

      // --- 2. Intentar Sincronización con Backend ---
      let syncExitoso = false;
      let serverErrorMessage = '';

      try {
        setLoading(true);
        await api.post('/api/guias/guardar-carga', payload, { timeout: 8000 });
        syncExitoso = true;
        nuevaGuia.syncStatus = 'synced';
      } catch (err) {
        console.log("Error de sincronización:", err);
        // Diferenciar error de Negocio (Backend rechaza) vs Error de Red (Offline)
        if (err.status && err.status >= 400) {
          // El servidor respondió, pero rechazó la data (ej: JSON inválido, duplicado, error SQL)
          serverErrorMessage = err.data?.error || err.message || 'Error desconocido del servidor';
        } else {
          // No hubo respuesta (Offline, timeout)
          serverErrorMessage = null; // null implica "Offline"
        }
      } finally {
        setLoading(false);
      }

      // --- 3. Manejo de Resultado ---
      if (serverErrorMessage) {
        // ERROR CRÍTICO DEL SERVIDOR: No guardamos localmente porque la data está "mal" según el servidor.
        Alert.alert(
          'Error del Servidor',
          `No se pudo guardar la guía. El servidor rechazó los datos:\n"${serverErrorMessage}"`
        );
        return;
      }

      // Si fue Exitoso (200) o Offline (Network Error), guardamos local
      const nuevasGuias = [...guiasCargadas, nuevaGuia];
      await AsyncStorage.setItem(STORAGE_KEYS.GUIAS_CARGADAS_VEHICULO, JSON.stringify(nuevasGuias));

      // Limpiar escaneos de la fase de carga
      await AsyncStorage.removeItem(`${STORAGE_KEYS.ESCANEOS_PREFIX}${numeroCarga}`);

      Alert.alert(
        syncExitoso ? 'Éxito' : 'Modo Offline',
        syncExitoso
          ? 'Guía guardada y sincronizada correctamente.'
          : 'Sin conexión. Guía guardada en el teléfono para sincronizar luego.',
        [
          {
            text: 'OK',
            onPress: resetScreen
          }
        ],
        { cancelable: false }
      );

    } catch (e) {
      setLoading(false);
      Alert.alert('Error', 'No se pudieron guardar los datos localmente.');
      console.error(e);
    }
  };

  const resetScreen = () => {
    setGuiaData(null);
    setNumeroCarga('');
    setEscaneos({});
    setIsPolling(false);
    setNotaScan('');
    setScanningEnabled(false);
  };



  const verificarScan = useCallback((valorOriginal) => {
    if (!valorOriginal || !guiaData || !guiaData.detalle) return false;

    const valTrim = valorOriginal.trim();
    const valNormalized = normalizeCode(valTrim);

    console.log(`[SCAN] Original="${valTrim}" | Normalized="${valNormalized}"`);

    let encontrado = false;
    let itemMatched = null;
    let fieldMatched = ''; // 'factura' or 'nota'
    let nuevoEscaneos = { ...escaneos };

    for (const item of guiaData.detalle) {
      const key = getItemKey(item);
      const factData = String(item.factura || '').trim();
      const notaData = String(item.nota || '').trim();

      const factNormalized = normalizeCode(factData);
      const notaNormalized = normalizeCode(notaData);

      // Match logic:
      // 1. Exact trim match
      // 2. Normalized match (handles zeros, A/B rules)
      // 3. Reverse normalization match (if scan is '1' but DB is '001')

      const isFactMatch = (valTrim === factData || valNormalized === factNormalized || valNormalized === factData || valTrim === factNormalized);
      const isNotaMatch = (valTrim === notaData || valNormalized === notaNormalized || valNormalized === notaData || valTrim === notaNormalized);

      if (isFactMatch) {
        if (!nuevoEscaneos[key]?.factura) {
          encontrado = true;
          fieldMatched = 'factura';
          itemMatched = item;
          nuevoEscaneos[key] = { ...nuevoEscaneos[key], factura: true };
          console.log(`✅ MATCH FACTURA: ${factData} (Key: ${key})`);
          break;
        } else {
          console.log(`ℹ️ Factura ${factData} ya estaba escaneada.`);
        }
      }

      if (isNotaMatch) {
        if (!nuevoEscaneos[key]?.nota) {
          encontrado = true;
          fieldMatched = 'nota';
          itemMatched = item;
          nuevoEscaneos[key] = { ...nuevoEscaneos[key], nota: true };
          console.log(`✅ MATCH NOTA: ${notaData} (Key: ${key})`);
          break;
        } else {
          console.log(`ℹ️ Nota ${notaData} ya estaba escaneada.`);
        }
      }
    }

    if (encontrado) {
      setEscaneos(nuevoEscaneos);
      guardarEscaneosLocal(nuevoEscaneos);
    } else {
      console.log(`❌ NO MATCH para: ${valTrim}`);
    }
    return encontrado;
  }, [guiaData, escaneos, numeroCarga]);

  const handleBarCodeScanned = ({ data }) => {
    if (scanned) return;
    setScanned(true);
    const val = data.trim();

    const success = verificarScan(val);
    if (success) {
      showMessage({
        message: "Éxito",
        description: `Código ${val} verificado correctamente.`,
        type: "success",
        icon: "success",
        duration: 3000,
      });
    } else {
      SoundManager.playErrorSound();
      showMessage({
        message: "Error",
        description: `Código ${val} no encontrado o ya escaneado.`,
        type: "danger",
        icon: "danger",
        duration: 4000,
        backgroundColor: COLORS.error, // Ensure red background
        textStyle: { fontSize: 18, fontWeight: 'bold' }, // Make text bigger/bolder
        titleStyle: { fontSize: 20, fontWeight: 'bold' },
      });
    }

    setTimeout(() => setScanned(false), 1500);
  };

  const handleManualScan = () => {
    if (!notaScan) return;
    const success = verificarScan(notaScan);
    if (success) {
      setNotaScan(''); // Clear input on success
      showMessage({
        message: "Éxito",
        description: "Código manual verificado.",
        type: "success",
        icon: "success",
      });
    } else {
      SoundManager.playErrorSound();
      showMessage({
        message: "Error",
        description: "Código no encontrado o ya escaneado.",
        type: "danger",
        icon: "danger",
        duration: 4000,
        backgroundColor: COLORS.error,
        textStyle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
        titleStyle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
      });
    }
  };

  const toggleCamera = async () => {
    if (!scanningEnabled) {
      if (!permission?.granted) {
        const { granted } = await requestPermission();
        if (!granted) {
          Alert.alert("Permiso denegado", "Se necesita acceso a la cámara");
          return;
        }
      }
    }
    setScanningEnabled(!scanningEnabled);
  };

  // --- Handlers UI ---
  const handleSearch = () => {
    if (!numeroCarga) return;
    setGuiaData(null);
    setEscaneos({});
    setScanningEnabled(false);
    setIsPolling(false); // Stop old polling
    fetchGuia(numeroCarga, false);
  };

  const handleStopPolling = () => setIsPolling(false);
  const handleStartPolling = () => setIsPolling(true);

  // --- Render ---
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.headerContainer}>
        <Text style={styles.title}>Gestión de Carga (En Vivo)</Text>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="N° de Guía"
            keyboardType="numeric"
            value={numeroCarga}
            onChangeText={setNumeroCarga}
          />
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary]}
            onPress={handleSearch}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Buscar</Text>}
          </TouchableOpacity>
        </View>
        {isPolling && (
          <View style={styles.statusRow}>
            <View style={styles.liveIndicator}>
              <View style={styles.dot} />
              <Text style={styles.liveText}>En Vivo</Text>
            </View>
            {estatusCarga && (
              <View style={[styles.statusBadge, isCargaFinalizada ? styles.badgeSuccess : styles.badgeWarning]}>
                <Text style={[styles.statusText, !isCargaFinalizada && { color: COLORS.darkGray }]}>
                  {isCargaFinalizada
                    ? "CARGA FINALIZADA"
                    : (estatusCarga === 'A' ? "CARGA EN PROCESO" : `ESTATUS: ${estatusCarga}`)}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {guiaData && (
          <View style={styles.dataContainer}>

            {/* Botonera de Acciones */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.btn, scanningEnabled ? styles.btnError : styles.btnInfo, { flex: 1, marginRight: 5 }]}
                onPress={toggleCamera}
              >
                <Text style={styles.btnText}>{scanningEnabled ? 'Cerrar Cámara' : 'Abrir Cámara / Escanear'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btn, { backgroundColor: COLORS.warning, flex: 1, marginLeft: 5 }]}
                onPress={limpiarEscaneos}
              >
                <Text style={[styles.btnText, { color: COLORS.darkGray }]}>Limpiar Escaneos</Text>
              </TouchableOpacity>
            </View>

            {/* Cámara Area */}
            {scanningEnabled && (
              <View style={styles.cameraBox}>
                <CameraView
                  onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                  style={styles.camera}
                />
                <TouchableOpacity style={styles.closeCamBtn} onPress={() => setScanningEnabled(false)}>
                  <Text style={styles.closeCamText}>X</Text>
                </TouchableOpacity>

                {/* Input Manual junto a la cámara */}
                <View style={styles.manualScanBox}>
                  <TextInput
                    style={styles.manualInput}
                    placeholder="Ingresar código manual"
                    value={notaScan}
                    onChangeText={setNotaScan}
                    onSubmitEditing={handleManualScan}
                  />
                </View>
              </View>
            )}

            {/* Resumen "Cargado" */}
            <Text style={styles.sectionTitle}>Resumen de Carga</Text>
            {guiaData.cargado && guiaData.cargado.length > 0 ? (
              <View style={styles.table}>
                <TableHeader headers={['Ruta', 'Conductor', 'Vehículo', 'Realizado']} />
                {guiaData.cargado.map((item, idx) => (
                  <View key={idx} style={[styles.tableRow, idx % 2 === 0 ? styles.rowEven : styles.rowOdd]}>
                    <Text style={styles.tableCell}>{item.ruta}</Text>
                    <Text style={styles.tableCell}>{item.conductor}</Text>
                    <Text style={styles.tableCell}>{item.vehiculo}</Text>
                    <Text style={styles.tableCell}>{item.realizado}</Text>
                  </View>
                ))}
              </View>
            ) : <Text style={styles.noData}>Sin datos de cabecera.</Text>}

            {/* Detalle "Pedidos" */}
            <View style={{ flexDirection: 'column', marginVertical: 10 }}>
              <Text style={styles.sectionTitle}>
                Detalle de Pedidos
              </Text>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryText}>Total: {guiaData.detalle?.length || 0}</Text>
                <Text style={[styles.summaryText, { color: COLORS.success }]}>
                  Completos: {Object.values(escaneos).filter(e => e.factura && e.nota).length}
                </Text>
                <Text style={[styles.summaryText, { color: COLORS.warning }]}>
                  Parciales: {Object.values(escaneos).filter(e => (e.factura || e.nota) && !(e.factura && e.nota)).length}
                </Text>
              </View>
            </View>

            {guiaData.detalle && guiaData.detalle.length > 0 ? (
              <View style={styles.table}>
                <TableHeader headers={['St', 'Fact/Nota', 'Paq', 'Desc']} />
                {guiaData.detalle.map((item, idx) => {
                  const key = getItemKey(item);
                  return (
                    <DetailRow
                      key={`${key}-${idx}`}
                      item={item}
                      index={idx}
                      escaneo={escaneos[key]}
                    />
                  );
                })}
              </View>
            ) : <Text style={styles.noData}>Sin detalle.</Text>}

            {/* GUARDAR BUTTON */}
            <View style={{ marginTop: 20, marginBottom: 40 }}>
              {isCargaFinalizada ? (
                <TouchableOpacity style={[styles.btn, styles.btnSuccess]} onPress={guardarGuiaFinalizada}>
                  <Text style={[styles.btnText, { fontSize: 18 }]}>Guardar / Registrar Guía</Text>
                </TouchableOpacity>
              ) : (
                <View style={[styles.btn, styles.btnDisabled]}>
                  <Text style={styles.btnText}>Esperando finalización de carga...</Text>
                </View>
              )}
            </View>

          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.lightGray },
  headerContainer: { padding: 16, backgroundColor: COLORS.white, elevation: 2 },
  title: { fontSize: 20, fontWeight: 'bold', color: COLORS.primary, marginBottom: 12, textAlign: 'center' },
  searchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  searchInput: {
    flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 10, marginRight: 8, backgroundColor: '#fff', fontSize: 16
  },
  btn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center', elevation: 2 },
  btnPrimary: { backgroundColor: COLORS.primary },
  btnInfo: { backgroundColor: COLORS.info },
  btnError: { backgroundColor: COLORS.error },
  btnText: { color: COLORS.white, fontWeight: 'bold' },
  scrollContent: { padding: 16 },
  errorText: { color: COLORS.error, textAlign: 'center', marginVertical: 10 },
  liveIndicator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: 'red', marginRight: 6 },
  liveText: { color: 'red', fontWeight: 'bold', fontSize: 12 },

  // Table Styles
  table: { borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#fff', marginBottom: 20 },
  tableRowHeader: { flexDirection: 'row', backgroundColor: COLORS.primary, padding: 10 },
  tableHeaderCell: { flex: 1, color: '#fff', fontWeight: 'bold', textAlign: 'center', fontSize: 13 },
  tableRow: { flexDirection: 'row', padding: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  tableCell: { flex: 1, textAlign: 'center', fontSize: 13, color: COLORS.darkGray },
  rowEven: { backgroundColor: '#fff' },
  rowOdd: { backgroundColor: '#f9f9f9' },
  rowUno: { backgroundColor: '#fff3cd' }, // Yellowish for partial
  rowAmbos: { backgroundColor: '#d4edda' }, // Greenish for full

  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.darkGray, marginVertical: 10 },
  noData: { textAlign: 'center', color: COLORS.gray, marginVertical: 10 },

  // Camera
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  cameraBox: { height: 300, overflow: 'hidden', borderRadius: 12, marginBottom: 16, backgroundColor: '#000', position: 'relative' },
  camera: { flex: 1 },
  closeCamBtn: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.6)', width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  closeCamText: { color: '#fff', fontWeight: 'bold' },
  manualScanBox: { padding: 10, backgroundColor: '#fff' },
  manualInput: { borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6 },

  actionRow: { flexDirection: 'row', marginBottom: 16 },

  // Status Badges
  statusRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 10, alignItems: 'center', gap: 10 },
  statusBadge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12 },
  badgeSuccess: { backgroundColor: COLORS.success },
  badgeWarning: { backgroundColor: COLORS.warning },
  statusText: { color: COLORS.white, fontWeight: 'bold', fontSize: 12 },

  // Buttons
  btnSuccess: { backgroundColor: COLORS.success },
  btnDisabled: { backgroundColor: COLORS.gray },

  // Summary
  summaryRow: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#fff', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#eee' },
  summaryText: { fontSize: 13, fontWeight: 'bold', color: COLORS.darkGray },
});