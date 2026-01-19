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
  useWindowDimensions,
  Modal
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from "expo-camera";
import { api } from '../services/api'; // Usar nuestro servicio API robusto
import FlashMessage, { showMessage } from "react-native-flash-message";
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
  const [cameraError, setCameraError] = useState(null); // NEW: Track camera errors

  // Polling
  const [isPolling, setIsPolling] = useState(false);

  // Estados para Modal de Feedback
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackData, setFeedbackData] = useState({
    title: '',
    message: '',
    status: 'success', // success, error, warning
    value: ''
  });

  // NEW: Estados para guardado y conexión
  const [lastSaved, setLastSaved] = useState(null); // Timestamp del último guardado
  const [isOnline, setIsOnline] = useState(true); // Estado de conexión
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved', 'saving', 'error'
  const [pendingSync, setPendingSync] = useState(false); // Hay datos sin sincronizar

  // Auto-close feedback modal
  useEffect(() => {
    let timer;
    if (showFeedbackModal) {
      timer = setTimeout(() => {
        setShowFeedbackModal(false);
      }, 2500);
    }
    return () => clearTimeout(timer);
  }, [showFeedbackModal]);

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
          console.log(`✅ Recuperados ${Object.keys(parsed).length} escaneos guardados`);
          // Mostrar notificación al usuario
          showMessage({
            message: "Datos Recuperados",
            description: `Se recuperaron ${Object.keys(parsed).length} items escaneados previamente`,
            type: "success",
            duration: 3000
          });
        }
      }
    } catch (error) {
      console.error('❌ Error loading scans:', error);
      showMessage({
        message: "Error de Recuperación",
        description: "No se pudieron recuperar los escaneos previos",
        type: "warning"
      });
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

  // --- Polling (Refactored for Safety) ---
  const pollTimerRef = React.useRef(null);

  const startPolling = useCallback(() => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);

    const poll = async () => {
      // Only poll if screen is focused and we have a number
      if (!numeroCarga) return;

      try {
        await fetchGuia(numeroCarga, true);
      } catch (e) {
        // Ignore background errors
      }

      // Schedule next poll ONLY after previous one finishes
      if (isPolling) {
        pollTimerRef.current = setTimeout(poll, POLL_INTERVAL);
      }
    };

    poll();
  }, [numeroCarga, fetchGuia, isPolling]);

  useEffect(() => {
    if (isPolling) {
      startPolling();
    } else {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    }
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [isPolling, startPolling]);


  // --- Lógica de Escaneo ---
  const guardarEscaneosLocal = async (nuevosEscaneos) => {
    try {
      setSaveStatus('saving');
      await AsyncStorage.setItem(`${STORAGE_KEYS.ESCANEOS_PREFIX}${numeroCarga}`, JSON.stringify(nuevosEscaneos));
      const now = new Date();
      setLastSaved(now);
      setSaveStatus('saved');
      console.log(`💾 Auto-guardado exitoso: ${Object.keys(nuevosEscaneos).length} items a las ${now.toLocaleTimeString()}`);
      return true;
    } catch (e) {
      console.error('❌ Error guardando escaneos:', e);
      setSaveStatus('error');
      // Intentar guardar en un backup key
      try {
        await AsyncStorage.setItem(`${STORAGE_KEYS.ESCANEOS_PREFIX}${numeroCarga}_backup`, JSON.stringify(nuevosEscaneos));
        console.log('💾 Guardado en backup exitoso');
        return true;
      } catch (backupError) {
        console.error('❌ Error crítico: no se pudo guardar ni en backup:', backupError);
        Alert.alert(
          'Error Crítico de Guardado',
          'No se pudieron guardar los datos. Por favor, tome captura de pantalla de sus escaneos.',
          [{ text: 'Entendido' }]
        );
        return false;
      }
    }
  };

  // NEW: Auto-save con debounce cuando cambian los escaneos
  const saveTimerRef = React.useRef(null);
  useEffect(() => {
    if (Object.keys(escaneos).length > 0 && numeroCarga) {
      // Debounce de 500ms para evitar escrituras excesivas
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        guardarEscaneosLocal(escaneos);
      }, 500);
    }
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [escaneos, numeroCarga]);

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

  // NEW: Función para guardar progreso forzado (sin validar estatus)
  const guardarProgresoForzado = async () => {
    if (!guiaData || !numeroCarga) {
      Alert.alert('Error', 'No hay datos para guardar');
      return;
    }

    Alert.alert(
      'Guardar Progreso',
      `¿Desea guardar el progreso actual?\n\nItems escaneados: ${Object.keys(escaneos).length}\nTotal en guía: ${guiaData.detalle?.length || 0}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Guardar',
          onPress: async () => {
            try {
              // Primero guardamos localmente
              const saved = await guardarEscaneosLocal(escaneos);
              if (!saved) return;

              // Preparar datos para guardado
              const now = new Date();
              const progresoData = {
                numeroCarga,
                escaneos: escaneos,
                totalEscaneados: Object.keys(escaneos).length,
                totalItems: guiaData.detalle?.length || 0,
                horaGuardado: now.toLocaleTimeString(),
                fechaGuardado: now.toLocaleDateString(),
                timestampGuardado: now.getTime(),
                tipo: 'progreso_parcial',
                estatus: estatusCarga || 'desconocido'
              };

              // Guardar en lista de progresos
              const progresosKey = `${STORAGE_KEYS.ESCANEOS_PREFIX}progresos`;
              const progresos = await AsyncStorage.getItem(progresosKey).then(res => res ? JSON.parse(res) : []) || [];

              // Actualizar o agregar
              const index = progresos.findIndex(p => p.numeroCarga === numeroCarga);
              if (index >= 0) {
                progresos[index] = progresoData;
              } else {
                progresos.push(progresoData);
              }

              await AsyncStorage.setItem(progresosKey, JSON.stringify(progresos));

              showMessage({
                message: "✅ Progreso Guardado",
                description: `${Object.keys(escaneos).length} items guardados localmente`,
                type: "success",
                duration: 3000
              });

              console.log('💾 Progreso forzado guardado exitosamente');
            } catch (error) {
              console.error('❌ Error guardando progreso:', error);
              Alert.alert('Error', 'No se pudo guardar el progreso. Intente nuevamente.');
            }
          }
        }
      ]
    );
  };

  const guardarGuiaFinalizada = async () => {
    if (!guiaData) return;

    try {
      // SIEMPRE guardamos localmente primero
      const savedLocally = await guardarEscaneosLocal(escaneos);
      if (!savedLocally) {
        Alert.alert('Error', 'No se pudieron guardar los datos localmente. No se puede continuar.');
        return;
      }

      const guiasCargadas = await AsyncStorage.getItem(STORAGE_KEYS.GUIAS_CARGADAS_VEHICULO).then(res => res ? JSON.parse(res) : []) || [];

      // Validamos duplicados en "Historial de cargas enviadas", pero permitimos re-envío si falló antes?
      // Por ahora simple: si ya está, avisamos.
      const yaExiste = guiasCargadas.some(g => String(g.numeroCarga) === String(numeroCarga));
      if (yaExiste) {
        // Opcional: Permitir actualizar? 
        // Alert.alert('Aviso', 'Esta guía ya fue registrada anteriormente.');
        // return;
      }

      // --- 1. Preparar Payload Sanitizado ---
      // IMPORTANTE: Solo sanitizamos 'detalle', NO 'cargado'
      // El array 'cargado' DEBE mantener id_ca para que el backend identifique la guía correcta
      const forbiddenFieldsDetalle = ['fecha', 'status', 'estatus'];

      const sanitizeDetalleItem = (item) => {
        const clean = { ...item };
        forbiddenFieldsDetalle.forEach(f => delete clean[f]);
        return clean;
      };

      // Cargado: mantener todos los campos incluyendo id_ca
      const payloadCargado = guiaData.cargado || [];

      // Detalle: sanitizar campos prohibidos pero mantener id_ca si existe
      const payloadDetalle = (guiaData.detalle || []).map(sanitizeDetalleItem);

      // Payload para envío
      const payload = {
        ok: true,
        id_ca: Number(numeroCarga),
        detalle: payloadDetalle,
        cargado: payloadCargado
      };

      // Datos para guardado local
      const now = new Date();
      const nuevaGuia = {
        numeroCarga,
        cargado: guiaData.cargado || [],
        detalle: guiaData.detalle || [],
        horaGuardado: now.toLocaleTimeString(),
        fechaGuardado: now.toLocaleDateString(),
        timestampGuardado: now.getTime(),
        syncStatus: 'pending'
      };

      // --- 2. Intentar Sincronización con Backend (con retry) ---
      let syncExitoso = false;
      let serverErrorMessage = '';
      const maxRetries = 3;
      let retryCount = 0;

      while (retryCount < maxRetries && !syncExitoso && !serverErrorMessage) {
        try {
          setLoading(true);
          setIsOnline(true);
          console.log(`🔄 Intento de sincronización ${retryCount + 1}/${maxRetries}`);

          // Mostrar payload completo en consola
          console.log('📤 PAYLOAD ENVIADO AL BACKEND:');
          console.log('   id_ca:', payload.id_ca);
          console.log('   ok:', payload.ok);
          console.log('   cargado:', JSON.stringify(payload.cargado, null, 2));
          console.log('   detalle (primeros 3 items):', JSON.stringify(payload.detalle.slice(0, 3), null, 2));
          console.log('   detalle total items:', payload.detalle.length);

          await api.post('/api/guias/guardar-carga', payload, { timeout: 20000 }); // Más timeout para listas grandes
          syncExitoso = true;
          nuevaGuia.syncStatus = 'synced';
          setPendingSync(false);
          console.log('✅ Sincronización exitosa');
        } catch (err) {
          console.log(`❌ Error de sincronización (intento ${retryCount + 1}):`, err);

          if (err.status === 409) {
            // Conflicto - ya existe, consideramos exitoso
            syncExitoso = true;
            nuevaGuia.syncStatus = 'synced';
            serverErrorMessage = null;
            setPendingSync(false);
            console.log('⚠️ Guía ya existente en servidor (409)');
          } else if (err.status && err.status >= 400 && err.status < 500) {
            // Error del cliente (400-499) - no reintentar
            serverErrorMessage = err.data?.error || err.message || 'Error desconocido del servidor';
            setIsOnline(true);
            console.error('❌ Error del cliente:', serverErrorMessage);
            break;
          } else {
            // Error de red o servidor (500+) - reintentar
            retryCount++;
            if (retryCount < maxRetries) {
              console.log(`⏳ Reintentando en ${retryCount * 2} segundos...`);
              await new Promise(resolve => setTimeout(resolve, retryCount * 2000)); // Backoff exponencial
            } else {
              // Sin conexión o error persistente
              setIsOnline(false);
              setPendingSync(true);
              nuevaGuia.syncStatus = 'pending';
              console.log('📴 Sin conexión - guardado local solamente');
            }
          }
        } finally {
          setLoading(false);
        }
      }

      // --- 3. Manejo de Resultado ---
      if (serverErrorMessage) {
        Alert.alert(
          'Error del Servidor',
          `No se pudo guardar la guía. El servidor rechazó los datos:\n"${serverErrorMessage}"`
        );
        return;
      }

      // Guardamos en historial de "Enviadas"
      if (!yaExiste) {
        const nuevasGuias = [...guiasCargadas, nuevaGuia];
        await AsyncStorage.setItem(STORAGE_KEYS.GUIAS_CARGADAS_VEHICULO, JSON.stringify(nuevasGuias));
      }

      // IMPORTANTE: NO Borramos los escaneos locales.
      // await AsyncStorage.removeItem(`${STORAGE_KEYS.ESCANEOS_PREFIX}${numeroCarga}`); <-- LINEA ELIMINADA PARA PERSISTENCIA

      showMessage({
        message: syncExitoso ? '✅ Guardado Exitoso' : '📴 Guardado Local',
        description: syncExitoso
          ? 'Guía guardada y sincronizada con el servidor'
          : 'Sin conexión. Guía guardada localmente para sincronizar después',
        type: syncExitoso ? 'success' : 'warning',
        duration: 4000
      });

      Alert.alert(
        syncExitoso ? 'Éxito' : 'Modo Offline',
        syncExitoso
          ? 'Guía guardada y sincronizada correctamente.'
          : 'Sin conexión. Guía guardada en el teléfono para sincronizar luego.\n\n⚠️ Los datos están seguros en su dispositivo.',
        [
          {
            text: 'OK',
            onPress: () => {
              // No reseteamos la pantalla completamente para que el usuario vea su trabajo finalizado
              setIsPolling(false);
              setScanningEnabled(false);
              // Forzamos refresh del header para mostrar "FINALIZADA" si cambió el status
              fetchGuia(numeroCarga, false);
            }
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
    if (!valorOriginal || !guiaData || !guiaData.detalle) {
      return { result: 'error', message: 'Datos de guía no disponibles' };
    }

    const valTrim = valorOriginal.trim();
    const valNormalized = normalizeCode(valTrim);

    console.log(`[SCAN] Original="${valTrim}" | Normalized="${valNormalized}"`);

    let result = { result: 'not_found', value: valTrim };

    // Optimización: No iterar si no hay input válido
    if (!valTrim) return result;

    // Copia superficial para mutación controlada
    let nuevoEscaneos = { ...escaneos };
    let matchFound = false;

    // Busqueda optimizada? Con 100 items un for loop es imperceptible (<1ms).
    // El problema de performance viene del render, no de este loop.
    for (const item of guiaData.detalle) {
      const key = getItemKey(item);
      const factData = String(item.factura || '').trim();
      const notaData = String(item.nota || '').trim();

      const factNormalized = normalizeCode(factData);
      const notaNormalized = normalizeCode(notaData);

      const isFactMatch = (valTrim === factData || valNormalized === factNormalized || valNormalized === factData || valTrim === factNormalized);
      const isNotaMatch = (valTrim === notaData || valNormalized === notaNormalized || valNormalized === notaData || valTrim === notaNormalized);

      if (isFactMatch) {
        if (!nuevoEscaneos[key]?.factura) {
          nuevoEscaneos[key] = { ...nuevoEscaneos[key], factura: true };
          result = { result: 'success', type: 'Factura', value: factData, isComplete: !!nuevoEscaneos[key].nota };
          matchFound = true;
          break;
        } else {
          result = { result: 'duplicate', type: 'Factura', value: factData };
          matchFound = true;
          break;
        }
      }

      if (isNotaMatch) {
        if (!nuevoEscaneos[key]?.nota) {
          nuevoEscaneos[key] = { ...nuevoEscaneos[key], nota: true };
          result = { result: 'success', type: 'Pedido/Nota', value: notaData, isComplete: !!nuevoEscaneos[key].factura };
          matchFound = true;
          break;
        } else {
          result = { result: 'duplicate', type: 'Pedido/Nota', value: notaData };
          matchFound = true;
          break;
        }
      }
    }

    if (result.result === 'success') {
      setEscaneos(nuevoEscaneos);
      guardarEscaneosLocal(nuevoEscaneos);
    }

    return result;
  }, [guiaData, escaneos, numeroCarga]);

  const handleResult = (res) => {
    if (res.result === 'success') {
      setFeedbackData({
        title: '¡Escaneo Exitoso!',
        message: `${res.type} ${res.value} verificado correctamente. ${res.isComplete ? '\n(Item completo ✅)' : '\n(Falta la otra parte)'}`,
        status: res.isComplete ? 'success' : 'warning',
        value: res.value
      });
      setShowFeedbackModal(true);
    } else if (res.result === 'duplicate') {
      SoundManager.playErrorSound();
      setFeedbackData({
        title: 'Ya Escaneado',
        message: `El ${res.type} ${res.value} ya fue escaneado previamente.`,
        status: 'warning',
        value: res.value
      });
      setShowFeedbackModal(true);
    } else {
      SoundManager.playErrorSound();
      setFeedbackData({
        title: 'No Encontrado',
        message: `El código "${res.value}" no pertenece a esta guía.`,
        status: 'error',
        value: res.value
      });
      setShowFeedbackModal(true);
    }
  };

  const handleBarCodeScanned = ({ data }) => {
    if (scanned || showFeedbackModal) return;
    setScanned(true);
    const val = data.trim();
    const res = verificarScan(val);
    handleResult(res);
    setTimeout(() => setScanned(false), 2000); // 2s cooldown
  };

  const handleManualScan = () => {
    if (!notaScan || showFeedbackModal) return;
    const res = verificarScan(notaScan);
    handleResult(res);
    if (res.result === 'success') setNotaScan('');
  };

  const toggleCamera = async () => {
    try {
      if (!scanningEnabled) {
        setCameraError(null);
        if (!permission?.granted) {
          const { granted } = await requestPermission();
          if (!granted) {
            Alert.alert(
              "Permiso Denegado",
              "Se necesita acceso a la cámara para escanear. Puede usar el ingreso manual como alternativa.",
              [{ text: 'Entendido' }]
            );
            return;
          }
        }
        console.log('📷 Cámara activada');
      } else {
        console.log('📷 Cámara desactivada');
      }
      setScanningEnabled(!scanningEnabled);
    } catch (error) {
      console.error('❌ Error al activar cámara:', error);
      setCameraError(error.message || 'Error desconocido');
      setScanningEnabled(false);
      Alert.alert(
        'Error de Cámara',
        `No se pudo activar la cámara: ${error.message}\n\nPuede usar el ingreso manual para continuar escaneando.`,
        [
          { text: 'Usar Manual', onPress: () => setScanningEnabled(false) },
          { text: 'Reintentar', onPress: () => toggleCamera() }
        ]
      );
    }
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

  // Render para FlatList
  const renderItem = useCallback(({ item, index }) => {
    const key = getItemKey(item);
    return (
      <DetailRow
        item={item}
        index={index}
        escaneo={escaneos[key]}
      />
    );
  }, [escaneos]);

  const keyExtractor = useCallback((item) => getItemKey(item), []);

  // --- Render ---
  return (
    <View style={{ flex: 1 }}>
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

        <ScrollView style={styles.scrollContent}>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {guiaData && (
            <>
              {/* Header Data Container (Fixed Height) */}
              <View style={styles.dataContainer}>
                {/* Indicadores de Estado */}
                <View style={styles.statusIndicatorRow}>
                  {/* Estado de Guardado */}
                  <View style={styles.statusIndicator}>
                    <Ionicons
                      name={saveStatus === 'saved' ? 'cloud-done' : saveStatus === 'saving' ? 'cloud-upload' : 'cloud-offline'}
                      size={20}
                      color={saveStatus === 'saved' ? COLORS.success : saveStatus === 'saving' ? COLORS.info : COLORS.error}
                    />
                    <Text style={styles.statusIndicatorText}>
                      {saveStatus === 'saved' ? 'Guardado' : saveStatus === 'saving' ? 'Guardando...' : 'Error'}
                      {lastSaved && saveStatus === 'saved' ? ` (${lastSaved.toLocaleTimeString()})` : ''}
                    </Text>
                  </View>

                  {/* Estado de Conexión */}
                  <View style={styles.statusIndicator}>
                    <View style={[styles.connectionDot, { backgroundColor: isOnline ? COLORS.success : COLORS.error }]} />
                    <Text style={styles.statusIndicatorText}>{isOnline ? 'En Línea' : 'Sin Conexión'}</Text>
                  </View>

                  {/* Datos Pendientes */}
                  {pendingSync && (
                    <View style={[styles.statusIndicator, { backgroundColor: COLORS.warning, paddingHorizontal: 8, borderRadius: 12 }]}>
                      <Ionicons name="sync" size={16} color={COLORS.darkGray} />
                      <Text style={[styles.statusIndicatorText, { color: COLORS.darkGray, fontSize: 11 }]}>Pendiente Sync</Text>
                    </View>
                  )}
                </View>

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

                {/* NUEVO: Botón de Guardar Progreso Forzado */}
                <TouchableOpacity
                  style={[styles.btn, styles.btnWarning, { marginBottom: 10 }]}
                  onPress={guardarProgresoForzado}
                  disabled={Object.keys(escaneos).length === 0}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="save" size={20} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.btnText}>
                      💾 Guardar Progreso ({Object.keys(escaneos).length} items)
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Cámara Area */}
                {scanningEnabled && (
                  <View style={styles.cameraBox}>
                    {cameraError ? (
                      <View style={styles.cameraErrorContainer}>
                        <Ionicons name="camera-off" size={60} color={COLORS.error} />
                        <Text style={styles.cameraErrorText}>Error de Cámara</Text>
                        <Text style={styles.cameraErrorDetail}>{cameraError}</Text>
                        <TouchableOpacity
                          style={[styles.btn, styles.btnPrimary, { marginTop: 15 }]}
                          onPress={() => {
                            setCameraError(null);
                            toggleCamera();
                          }}
                        >
                          <Text style={styles.btnText}>Reintentar</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <CameraView
                        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                        style={styles.camera}
                        onCameraReady={() => console.log('📷 Cámara lista')}
                        onMountError={(error) => {
                          console.error('❌ Error montando cámara:', error);
                          setCameraError(error.message || 'Error al inicializar cámara');
                        }}
                      />
                    )}
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
              </View>

              {/* LISTA DE PEDIDOS */}
              <View style={{ backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, marginBottom: 20 }}>
                {/* Header de la tabla fijo */}
                <TableHeader headers={['St', 'Fact/Nota', 'Paq', 'Desc']} />

                {guiaData.detalle && guiaData.detalle.length > 0 ? (
                  <>
                    {guiaData.detalle.map((item, index) => {
                      const key = getItemKey(item);
                      return (
                        <DetailRow
                          key={key}
                          item={item}
                          index={index}
                          escaneo={escaneos[key]}
                        />
                      );
                    })}
                    <View style={{ marginTop: 20, marginBottom: 20, paddingHorizontal: 16 }}>
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
                  </>
                ) : (
                  <Text style={styles.noData}>Sin detalle.</Text>
                )}
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <FlashMessage position="top" />

      {/* Modal de Feedback de Escaneo */}
      <Modal
        visible={showFeedbackModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowFeedbackModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.feedbackModalContent,
          feedbackData.status === 'success' ? styles.borderSuccess :
            feedbackData.status === 'warning' ? styles.borderWarning : styles.borderError
          ]}>
            <Ionicons
              name={
                feedbackData.status === 'success' ? "checkmark-circle" :
                  feedbackData.status === 'warning' ? "alert-circle" : "close-circle"
              }
              size={80}
              color={
                feedbackData.status === 'success' ? COLORS.success :
                  feedbackData.status === 'warning' ? COLORS.warning : COLORS.error
              }
            />
            <Text style={styles.feedbackTitle}>{feedbackData.title}</Text>
            <Text style={styles.feedbackValue}>{feedbackData.value}</Text>
            <Text style={styles.feedbackMessage}>{feedbackData.message}</Text>
          </View>
        </View>
      </Modal>
    </View>
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

  // Scan Feedback Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  feedbackModalContent: {
    backgroundColor: COLORS.white,
    borderRadius: 25,
    padding: 30,
    width: '90%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 15,
    borderWidth: 4,
  },
  borderSuccess: { borderColor: COLORS.success },
  borderWarning: { borderColor: COLORS.warning },
  borderError: { borderColor: COLORS.error },
  feedbackTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.darkGray,
    marginTop: 15,
    textAlign: 'center'
  },
  feedbackValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginVertical: 10,
  },
  feedbackMessage: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    marginBottom: 25,
    lineHeight: 26,
  },
  feedbackBtn: {
    width: '100%',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // NEW: Status Indicators
  statusIndicatorRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexWrap: 'wrap',
    gap: 8
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  statusIndicatorText: {
    fontSize: 12,
    color: COLORS.darkGray,
    fontWeight: '500'
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },

  // NEW: Camera Error Styles
  cameraErrorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    padding: 20
  },
  cameraErrorText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.error,
    marginTop: 15,
    marginBottom: 8
  },
  cameraErrorDetail: {
    fontSize: 14,
    color: COLORS.gray,
    textAlign: 'center',
    marginBottom: 10
  },

  // NEW: Warning Button
  btnWarning: {
    backgroundColor: '#FF9800'
  },

  // Data Container
  dataContainer: {
    marginBottom: 10
  }
});
