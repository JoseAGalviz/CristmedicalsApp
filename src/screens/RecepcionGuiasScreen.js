import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Alert,
  Modal,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";

// Constantes y configuraciones
const API_BASE_URL = "https://98.94.185.164.nip.io/api/guias";
const STORAGE_KEYS = {
  USER_DATA: "userData",
  GUIAS_PENDIENTES: "guiasPendientes",
  RENGLONES_PENDIENTES: "renglonesPendientes",
  GUIAS_REGISTRADAS: "guiasRegistradas",
};

const SCAN_TYPES = {
  FACTURA: "factura",
  NOTA: "nota",
};

// Componentes separados para mejor organización
const GuiaItem = ({ guia, onPress }) => (
  <View style={styles.guiaBlock}>
    <TouchableOpacity onPress={onPress} style={styles.guiaHeaderTouchable}>
      <Text style={styles.guiaHeader}>
        Guía: {guia.id_ca} | Ruta: {guia.ruta ?? ""} | Conductor:{" "}
        {guia.conductor ?? ""}
      </Text>
    </TouchableOpacity>
  </View>
);

const TableHeader = () => (
  <View style={styles.tableRowHeader}>
    <Text style={styles.tableHeaderCell}>N° Factura</Text>
    <Text style={styles.tableHeaderCell}>N° Nota</Text>
    <Text style={styles.tableHeaderCell}>Descripción</Text>
  </View>
);

const TableRow = ({ renglon, escaneo, index }) => {
  const rowStyle = useMemo(() => {
    if (escaneo.factura && escaneo.nota) {
      return [styles.tableRow, styles.rowAmbos];
    } else if (escaneo.factura || escaneo.nota) {
      return [styles.tableRow, styles.rowUno];
    }
    return [styles.tableRow, index % 2 === 0 ? styles.rowEven : styles.rowOdd];
  }, [escaneo, index]);

  return (
    <View style={rowStyle}>
      <Text
        style={[styles.tableCell, escaneo.factura ? styles.cellFactura : null]}
      >
        {renglon.factura ?? ""}
      </Text>
      <Text style={[styles.tableCell, escaneo.nota ? styles.cellNota : null]}>
        {renglon.nota ?? ""}
      </Text>
      <Text style={styles.tableCell}>
        {renglon.descripcion ?? renglon.descrip ?? ""}
      </Text>
    </View>
  );
};

const CameraScanner = ({ onBarcodeScanned, onClose }) => (
  <View style={styles.cameraContainer}>
    <CameraView
      barcodeScannerSettings={{
        barcodeTypes: [
          "code128",
          "ean13",
          "ean8",
          "upc_a",
          "upc_e",
          "code39",
          "code93",
          "codabar",
          "qr",
        ],
      }}
      onBarcodeScanned={onBarcodeScanned}
      style={styles.cameraView}
    />
    <TouchableOpacity style={styles.closeScannerButton} onPress={onClose}>
      <Text style={styles.closeScannerText}>✕</Text>
    </TouchableOpacity>
    <Text style={styles.scannerLabel}>Escanea el código de Factura o Nota</Text>
  </View>
);

const CloseButton = ({ onPress }) => (
  <TouchableOpacity style={styles.closeButton} onPress={onPress}>
    <Text style={styles.closeButtonText}>✕</Text>
  </TouchableOpacity>
);

// Hook personalizado para la gestión del estado
const useGuiaManagement = () => {
  const [state, setState] = useState({
    loading: false,
    guias: [],
    renglones: [],
    error: "",
    coVenUsuario: "",
    guiaExpandida: null,
    modalVisible: false,
    guiaModal: null,
    scanValor: "",
    scanError: "",
    scanning: false,
    escaneos: {},
    comentario: "",
    enviando: false,
    modalRegistradas: false,
    guiasRegistradas: [],
    detalleFaltantes: "",
    registroIncompleto: false,
  });

  const [hasPermission, requestPermission] = useCameraPermissions();

  const updateState = useCallback((updates) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  useEffect(() => {
    if (hasPermission === null) {
      requestPermission();
    }
  }, [hasPermission]);

  return { ...state, updateState, hasPermission };
};

// Hook para operaciones de almacenamiento
const useStorage = () => {
  const getItem = useCallback(async (key) => {
    try {
      const value = await AsyncStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error(`Error getting ${key}:`, error);
      return null;
    }
  }, []);

  const setItem = useCallback(async (key, value) => {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Error setting ${key}:`, error);
    }
  }, []);

  return { getItem, setItem };
};

// Hook para operaciones de API
const useApi = () => {
  const fetchApi = useCallback(async (endpoint, options = {}) => {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: { "Content-Type": "application/json" },
        ...options,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("API request failed:", error);
      throw error;
    }
  }, []);

  return { fetchApi };
};

export default function RecepcionGuiasScreen() {
  const {
    loading,
    guias,
    renglones,
    error,
    coVenUsuario,
    modalVisible,
    guiaModal,
    scanValor,
    scanError,
    scanning,
    escaneos,
    comentario,
    enviando,
    modalRegistradas,
    guiasRegistradas,
    detalleFaltantes,
    registroIncompleto,
    updateState,
    hasPermission,
  } = useGuiaManagement();

  const { getItem, setItem } = useStorage();
  const { fetchApi } = useApi();

  const [busqueda, setBusqueda] = useState(""); // Estado para búsqueda
  const [resultadoBusqueda, setResultadoBusqueda] = useState(null); // NUEVO: resultado remoto
  const [buscando, setBuscando] = useState(false); // NUEVO: loading búsqueda

  // Agrupa renglones por id_ca
  const renglonesPorGuia = useMemo(() => {
    const result = {};
    renglones.forEach((r) => {
      if (!result[r.id_ca]) result[r.id_ca] = [];
      result[r.id_ca].push(r);
    });
    return result;
  }, [renglones]);

  // Cargar datos iniciales
  useEffect(() => {
    const cargarDatosIniciales = async () => {
      const userData = await getItem(STORAGE_KEYS.USER_DATA);
      if (userData) {
        updateState({ coVenUsuario: userData.co_ven || "" });
      }

      const guiasGuardadas = await getItem(STORAGE_KEYS.GUIAS_PENDIENTES);
      if (guiasGuardadas) updateState({ guias: guiasGuardadas });

      const renglonesGuardados = await getItem(
        STORAGE_KEYS.RENGLONES_PENDIENTES
      );
      if (renglonesGuardados) updateState({ renglones: renglonesGuardados });
    };

    cargarDatosIniciales();
  }, [getItem, updateState]);

  // Abrir modal con la guía seleccionada
  const abrirModalGuia = useCallback(
    (guia) => {
      updateState({
        guiaModal: guia,
        modalVisible: true,
        scanValor: "",
        scanError: "",
        escaneos: {},
        comentario: "",
        registroIncompleto: false,
        detalleFaltantes: "",
      });
    },
    [updateState]
  );

  // Escaneo manual o por código de barras
  const escanearRenglon = useCallback(
    (valorManual) => {
      updateState({ scanError: "" });
      const valorOriginal = (valorManual ?? scanValor).trim();
      if (!valorOriginal) return;

      const valor = transformarNumFactura(valorOriginal);

      // Fuente de renglones para escaneo y tabla
      const renglonesGuia =
        guiaModal?.detalle && guiaModal.detalle.length > 0
          ? guiaModal.detalle
          : renglonesPorGuia[guiaModal?.id_ca] || [];

      let encontrado = false;
      let doble = false;
      let nuevoEscaneos = { ...escaneos };
      let tipoEncontrado = "";

      for (let idx = 0; idx < renglonesGuia.length; idx++) {
        const item = renglonesGuia[idx];
        // Verifica factura
        if (String(item.factura || "").trim() === valor) {
          if (nuevoEscaneos[idx]?.factura) {
            doble = true;
            tipoEncontrado = SCAN_TYPES.FACTURA;
          } else {
            nuevoEscaneos[idx] = {
              ...(nuevoEscaneos[idx] || {}),
              factura: true,
              nota: nuevoEscaneos[idx]?.nota || false,
            };
            encontrado = true;
            tipoEncontrado = SCAN_TYPES.FACTURA;
          }
        }
        // Verifica nota
        if (String(item.nota || "").trim() === valor) {
          if (nuevoEscaneos[idx]?.nota) {
            doble = true;
            tipoEncontrado = tipoEncontrado
              ? "factura y nota"
              : SCAN_TYPES.NOTA;
          } else {
            nuevoEscaneos[idx] = {
              ...(nuevoEscaneos[idx] || {}),
              factura: nuevoEscaneos[idx]?.factura || false,
              nota: true,
            };
            encontrado = true;
            tipoEncontrado = tipoEncontrado
              ? "factura y nota"
              : SCAN_TYPES.NOTA;
          }
        }
      }

      if (doble) {
        Alert.alert(
          "Escaneo duplicado",
          `Este número de ${tipoEncontrado} ya fue registrado antes.`
        );
        updateState({ scanValor: "" });
        return;
      }

      if (encontrado) {
        updateState({ escaneos: nuevoEscaneos, scanValor: "" });
        Alert.alert("Éxito", `Se escaneó ${tipoEncontrado} correctamente.`);
      } else {
        const errorMsg =
          "¡El valor no pertenece a ninguna factura o nota de esta guía!";
        updateState({ scanError: errorMsg });
        Alert.alert("Error de escaneo", errorMsg);
      }
    },
    [scanValor, guiaModal, escaneos, renglonesPorGuia, updateState]
  );

  // Escaneo con cámara
  const handleBarCodeScanned = useCallback(
    (barcode) => {
      updateState({ scanValor: barcode.data, scanning: false });
      escanearRenglon(barcode.data); // <-- Llama directamente con el valor escaneado
    },
    [updateState, escanearRenglon]
  );

  // Función para generar detalle de faltantes
  const generarDetalleFaltantes = useCallback(() => {
    const renglonesGuia =
      guiaModal?.detalle && guiaModal.detalle.length > 0
        ? guiaModal.detalle
        : renglonesPorGuia[guiaModal?.id_ca] || [];
    const faltantes = renglonesGuia
      .map((item, idx) => {
        const escaneo = escaneos[idx] || {};
        let partes = [];
        if (!escaneo.factura) partes.push(`Factura: ${item.factura ?? "N/A"}`);
        if (!escaneo.nota) partes.push(`Nota: ${item.nota ?? "N/A"}`);
        if (partes.length > 0) {
          return `- ${partes.join(" | ")} | Descripción: ${
            item.descripcion ?? item.descrip ?? ""
          }`;
        }
        return null;
      })
      .filter(Boolean);
    return faltantes.length > 0
      ? "Faltantes:\n" + faltantes.join("\n")
      : "Todos los pedidos/facturas están completos.";
  }, [guiaModal, escaneos, renglonesPorGuia]);

  // Enviar datos al endpoint
  const enviarDatos = useCallback(async () => {
    updateState({ enviando: true });
    try {
      // Obtener coordenadas actuales
      let coordenadas = "";
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          let location = await Location.getCurrentPositionAsync({});
          coordenadas = `${location.coords.latitude},${location.coords.longitude}`;
        }
      } catch (e) {
        console.error("Error obteniendo ubicación:", e);
      }

      // Construir registros
      const renglonesGuia =
        guiaModal?.detalle && guiaModal.detalle.length > 0
          ? guiaModal.detalle
          : renglonesPorGuia[guiaModal.id_ca] || [];
      const fechaActual = new Date();
      const fechaStr = `${fechaActual.getFullYear()}-${String(
        fechaActual.getMonth() + 1
      ).padStart(2, "0")}-${String(fechaActual.getDate()).padStart(2, "0")}`;

      // Genera detalle de faltantes por cada registro
      const registros = renglonesGuia.map((item, idx) => {
        const escaneo = escaneos[idx] || {};
        let partes = [];
        if (!escaneo.factura) partes.push(`Factura: ${item.factura ?? "N/A"}`);
        if (!escaneo.nota) partes.push(`Nota: ${item.nota ?? "N/A"}`);
        let faltanteDetalle = partes.length > 0
          ? `Faltantes:\n- ${partes.join(" | ")} | Descripción: ${item.descripcion ?? item.descrip ?? ""}`
          : "";

        // El comentario del usuario + faltante (si aplica)
        let comentarioRegistro = comentario && comentario.trim().length > 0
          ? faltanteDetalle
            ? `${comentario}\n\n${faltanteDetalle}`
            : comentario
          : faltanteDetalle;

        return {
          id_ca: item.id_ca || guiaModal.id_ca,
          factura: item.factura,
          nota: item.nota,
          descripcion: item.descripcion ?? item.descrip ?? "",
          status: item.status ?? "RECIBIDO",
          vendedor: coVenUsuario,
          comentario: comentarioRegistro, // <-- AQUÍ VA EL COMENTARIO + FALTANTE
          fecha: fechaStr,
          coordenadas: coordenadas,
          escaneado_factura: escaneo.factura || false,
          escaneado_nota: escaneo.nota || false,
        };
      });

      // El campo general "comentario" solo lleva el comentario del usuario
      const jsonToSend = { registros, comentario };

      // LOG para depuración
      console.log(
        "Enviando a /recibir-guia:",
        JSON.stringify(jsonToSend, null, 2)
      );

      // Cambia la llamada para capturar el error del backend
      const response = await fetch(`${API_BASE_URL}/recibir-guia`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(jsonToSend),
      });

      let responseJson = null;
      try {
        responseJson = await response.json();
      } catch (e) {
        // Si no es JSON, ignora
      }

      // Si la respuesta tiene éxito o el backend confirma el guardado, muestra éxito
      if (response.ok || (responseJson && responseJson.success)) {
        // Guardar en guiasRegistradas
        let registradas = await getItem(STORAGE_KEYS.GUIAS_REGISTRADAS);
        let arrRegistradas = registradas || [];
        arrRegistradas.push({
          id_ca: guiaModal.id_ca,
          fecha: fechaStr,
          registros,
          comentario: comentario,
        });
        await setItem(STORAGE_KEYS.GUIAS_REGISTRADAS, arrRegistradas);

        // Eliminar de guiasPendientes y renglonesPendientes
        let arrGuiasPendientes = guias.filter((g) => g.id_ca !== guiaModal.id_ca);
        let arrRenglonesPendientes = renglones.filter(
          (r) => r.id_ca !== guiaModal.id_ca
        );

        await setItem(STORAGE_KEYS.GUIAS_PENDIENTES, arrGuiasPendientes);
        await setItem(STORAGE_KEYS.RENGLONES_PENDIENTES, arrRenglonesPendientes);

        // Actualizar estado local
        updateState({
          guias: arrGuiasPendientes,
          renglones: arrRenglonesPendientes,
          modalVisible: false,
          registroIncompleto: false,
          detalleFaltantes: "",
          enviando: false,
        });

        Alert.alert("Éxito", "Datos enviados correctamente.");
      } else {
        // Si la respuesta tiene un campo "error", muéstralo
        const errorMsg =
          responseJson && responseJson.error
            ? responseJson.error
            : "No se pudo enviar la información.";
        updateState({ enviando: false });
        Alert.alert("Error", errorMsg);
        return;
      }
    } catch (e) {
      updateState({ enviando: false });
      Alert.alert("Error", "No se pudo enviar la información.");
    }
  }, [
    guiaModal,
    escaneos,
    comentario,
    coVenUsuario,
    guias,
    renglones,
    renglonesPorGuia,
    generarDetalleFaltantes,
    updateState,
    getItem,
    setItem,
  ]);

  const mostrarRegistradas = useCallback(async () => {
    const registradas = await getItem(STORAGE_KEYS.GUIAS_REGISTRADAS);
    updateState({
      guiasRegistradas: registradas || [],
      modalRegistradas: true,
    });
  }, [getItem, updateState]);

  const iniciarRegistroIncompleto = useCallback(() => {
    const detalle = generarDetalleFaltantes();
    updateState({ detalleFaltantes: detalle });
    Alert.alert(
      "Registrar guía incompleta",
      "¿Seguro que deseas registrar la guía aunque no esté completa?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Registrar",
          style: "destructive",
          onPress: () => {
            updateState({
              registroIncompleto: true,
              comentario: "",
            });
            Alert.alert(
              "Registro incompleto",
              "Agrega el motivo y envía los datos."
            );
          },
        },
      ]
    );
  }, [generarDetalleFaltantes, updateState]);

  // Filtra las guías para mostrar solo las NO registradas y que coincidan con la búsqueda
  const guiasRegistradasIds = useMemo(
    () => new Set(guiasRegistradas.map((g) => g.id_ca)),
    [guiasRegistradas]
  );

  // NUEVO: Filtrado por búsqueda manual
  const guiasFiltradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return guias
      .filter((g) => !guiasRegistradasIds.has(g.id_ca))
      .filter((g) =>
        !texto
          ? true
          : [g.id_ca, g.ruta, g.conductor, g.nombre, g.descripcion, g.descrip]
              .map((x) => (x ? String(x).toLowerCase() : ""))
              .some((val) => val.includes(texto))
      );
  }, [guias, guiasRegistradasIds, busqueda]);

  // NUEVO: función para buscar guía por número usando el endpoint
  const buscarGuiaPorNumero = useCallback(
    async (numero) => {
      if (!numero || isNaN(Number(numero))) {
        setResultadoBusqueda(null);
        return;
      }
      setBuscando(true);
      try {
        const data = await fetchApi("/buscar-carga", {
          method: "POST",
          body: JSON.stringify({ numeroCarga: Number(numero) }),
        });
        setResultadoBusqueda(
          data && data.detalle && data.detalle.length > 0 ? data : null
        );
      } catch (e) {
        setResultadoBusqueda(null);
      } finally {
        setBuscando(false);
      }
    },
    [fetchApi]
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Recepción de Guías</Text>
      {/* Buscador manual */}
      <View style={styles.searchContainer}>
        <Ionicons
          name="search"
          size={20}
          color="#49AF4E"
          style={{ marginRight: 6 }}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar guía, ruta, conductor..."
          value={busqueda}
          onChangeText={setBusqueda}
          returnKeyType="search"
          onSubmitEditing={() => {
            if (busqueda.trim() && !isNaN(Number(busqueda.trim()))) {
              buscarGuiaPorNumero(busqueda.trim());
            } else {
              setResultadoBusqueda(null);
            }
          }}
        />
        <TouchableOpacity
          style={{
            marginLeft: 8,
            backgroundColor: "#49AF4E",
            borderRadius: 6,
            padding: 6,
          }}
          onPress={() => {
            if (busqueda.trim() && !isNaN(Number(busqueda.trim()))) {
              buscarGuiaPorNumero(busqueda.trim());
            } else {
              setResultadoBusqueda(null);
            }
          }}
        >
          <Ionicons name="search" size={20} color="#fff" />
        </TouchableOpacity>
        {busqueda.length > 0 && (
          <TouchableOpacity onPress={() => setBusqueda("")}>
            <Ionicons name="close-circle" size={20} color="#aaa" />
          </TouchableOpacity>
        )}
      </View>
      {/* Elimina este botón */}
      {/* <TouchableOpacity style={styles.button} onPress={consultarGuias}>
        <Text style={styles.buttonText}>Consultar guías asignadas</Text>
      </TouchableOpacity> */}
      <TouchableOpacity style={styles.button} onPress={mostrarRegistradas}>
        <Text style={styles.buttonText}>Ver guías registradas</Text>
      </TouchableOpacity>
      {/* NUEVO: Botón para borrar guías asignadas */}
      <TouchableOpacity
        style={[styles.button, { backgroundColor: "#d9534f" }]}
        onPress={async () => {
          await setItem(STORAGE_KEYS.GUIAS_PENDIENTES, []);
          await setItem(STORAGE_KEYS.RENGLONES_PENDIENTES, []);
          updateState({ guias: [], renglones: [] });
          Alert.alert(
            "Guías borradas",
            "Todas las guías asignadas han sido eliminadas."
          );
        }}
      >
        <Text style={[styles.buttonText, { color: "#fff" }]}>
          Borrar guías asignadas
        </Text>
      </TouchableOpacity>
      {loading && <ActivityIndicator size="large" color="#49AF4E" />}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <ScrollView>
        {buscando ? (
          <ActivityIndicator size="large" color="#49AF4E" />
        ) : resultadoBusqueda ? (
          <View style={styles.guiaBlock}>
            <Text style={styles.guiaHeader}>
              Guía: {resultadoBusqueda.detalle?.[0]?.id_ca || busqueda}
            </Text>
            <Text>
              Pedidos encontrados: {resultadoBusqueda.detalle?.length || 0}
            </Text>
            <TouchableOpacity
              style={[styles.button, { marginTop: 8 }]}
              onPress={() =>
                abrirModalGuia({
                  id_ca: resultadoBusqueda.detalle?.[0]?.id_ca || busqueda,
                  ruta: resultadoBusqueda.cargado?.[0]?.ruta,
                  conductor: resultadoBusqueda.cargado?.[0]?.conductor,
                  detalle: resultadoBusqueda.detalle, // <-- PASA LOS RENGLONES AQUÍ
                })
              }
            >
              <Text style={styles.buttonText}>Ver detalles</Text>
            </TouchableOpacity>
          </View>
        ) : guiasFiltradas.length === 0 && !loading ? (
          <Text>No hay guías asignadas.</Text>
        ) : (
          guiasFiltradas.map((guia) => (
            <GuiaItem
              key={guia.id_ca}
              guia={guia}
              onPress={() => abrirModalGuia(guia)}
            />
          ))
        )}
      </ScrollView>

      {/* Modal flotante para la tabla y escaneo */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => updateState({ modalVisible: false })}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { height: "90%", width: "95%" }]}>
            <CloseButton onPress={() => updateState({ modalVisible: false })} />
            <Text style={styles.modalTitle}>
              Pedidos de la Guía {guiaModal?.id_ca}
            </Text>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 20 }}
              showsVerticalScrollIndicator={true}
            >
              {/* Tabla de renglones */}
              {(() => {
                // Determina la fuente de los renglones a mostrar
                const renglonesTabla =
                  guiaModal?.detalle && guiaModal.detalle.length > 0
                    ? guiaModal.detalle
                    : renglonesPorGuia[guiaModal?.id_ca] || [];

                return renglonesTabla.length > 0 ? (
                  <View style={[styles.table, { maxHeight: 220 }]}>
                    <TableHeader />
                    <ScrollView>
                      {renglonesTabla.map((renglon, idx) => (
                        <TableRow
                          key={idx}
                          renglon={renglon}
                          escaneo={escaneos[idx] || {}}
                          index={idx}
                        />
                      ))}
                    </ScrollView>
                  </View>
                ) : (
                  <Text style={styles.renglonCampo}>
                    No hay renglones para esta guía.
                  </Text>
                );
              })()}

              {/* Zona de escaneo */}
              <View style={styles.scanBox}>
                <Text style={styles.scanTitle}>
                  Escanear o ingresar Factura/Nota
                </Text>
                {scanning ? (
                  <CameraScanner
                    onBarcodeScanned={handleBarCodeScanned}
                    onClose={() => updateState({ scanning: false })}
                  />
                ) : (
                  <>
                    <TextInput
                      style={styles.scanInput}
                      placeholder="Escribe o escanea Factura/Nota"
                      value={scanValor}
                      onChangeText={(text) => updateState({ scanValor: text })}
                      keyboardType="numeric"
                      onSubmitEditing={() => escanearRenglon()}
                    />
                    <TouchableOpacity
                      style={styles.scanButton}
                      onPress={() => updateState({ scanning: true })}
                    >
                      <Text style={styles.scanButtonText}>
                        Escanear código de barras
                      </Text>
                    </TouchableOpacity>
                  </>
                )}

                {/* Lógica para mostrar botones de envío o registro incompleto */}
                {(() => {
                  // Fuente de renglones para lógica de escaneo y envío
                  const renglonesTabla =
                    guiaModal?.detalle && guiaModal.detalle.length > 0
                      ? guiaModal.detalle
                      : renglonesPorGuia[guiaModal?.id_ca] || [];

                  const todosCompletos =
                    renglonesTabla.length > 0 &&
                    renglonesTabla.every(
                      (_, idx) => escaneos[idx]?.factura && escaneos[idx]?.nota
                    );

                  if (todosCompletos) {
                    return (
                      <>
                        <TextInput
                          style={styles.comentarioInput}
                          placeholder="Comentario (opcional)"
                          value={comentario}
                          onChangeText={(text) =>
                            updateState({ comentario: text })
                          }
                          multiline
                        />
                        <TouchableOpacity
                          style={[
                            styles.scanButton,
                            enviando && { backgroundColor: "#ccc" },
                          ]}
                          onPress={enviarDatos}
                          disabled={enviando}
                        >
                          <Text style={styles.scanButtonText}>
                            {enviando ? "Enviando..." : "Enviar datos"}
                          </Text>
                        </TouchableOpacity>
                      </>
                    );
                  }

                  if (
                    renglonesTabla.length > 0 &&
                    !todosCompletos &&
                    !registroIncompleto
                  ) {
                    return (
                      <TouchableOpacity
                        style={[
                          styles.scanButton,
                          { backgroundColor: "#FFD600" },
                        ]}
                        onPress={iniciarRegistroIncompleto}
                      >
                        <Text
                          style={[styles.scanButtonText, { color: "#333" }]}
                        >
                          Registrar guía incompleta
                        </Text>
                      </TouchableOpacity>
                    );
                  }

                  if (registroIncompleto) {
                    return (
                      <View style={{ width: "100%", marginTop: 10 }}>
                        <Text style={{ fontWeight: "bold", color: "#d9534f" }}>
                          Detalle de faltantes:
                        </Text>
                        <ScrollView style={{ maxHeight: 120 }}>
                          <Text
                            style={{
                              backgroundColor: "#f2fcf6",
                              padding: 8,
                              borderRadius: 6,
                              color: "#333",
                              marginBottom: 8,
                            }}
                          >
                            {detalleFaltantes}
                          </Text>
                        </ScrollView>
                        <Text style={{ fontWeight: "bold", marginBottom: 8 }}>
                          Motivo de faltante:
                        </Text>
                        <TextInput
                          style={styles.comentarioInput}
                          placeholder="Motivo"
                          value={comentario}
                          onChangeText={(text) =>
                            updateState({ comentario: text })
                          }
                          multiline
                        />
                        <TouchableOpacity
                          style={[
                            styles.scanButton,
                            enviando && { backgroundColor: "#ccc" },
                          ]}
                          onPress={enviarDatos}
                          disabled={enviando || !comentario.trim()}
                        >
                          <Text style={styles.scanButtonText}>
                            {enviando ? "Enviando..." : "Enviar datos"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    );
                  }

                  return null;
                })()}

                {scanError ? (
                  <Text style={styles.scanError}>{scanError}</Text>
                ) : null}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal para guías registradas */}
      <Modal
        visible={modalRegistradas}
        animationType="slide"
        transparent
        onRequestClose={() => updateState({ modalRegistradas: false })}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <CloseButton
              onPress={() => updateState({ modalRegistradas: false })}
            />
            <Text style={styles.modalTitle}>Guías Registradas</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              {guiasRegistradas.length === 0 ? (
                <Text>No hay guías registradas.</Text>
              ) : (
                guiasRegistradas.map((g, idx) => (
                  <View key={idx} style={styles.guiaBlock}>
                    <Text>Guía: {g.id_ca}</Text>
                    <Text>
                      Fecha registro: {new Date(g.fecha).toLocaleString()}
                    </Text>
                    {g.registros.map((r, i) => (
                      <Text key={i}>
                        Factura: {r.factura} | Nota: {r.nota} | Descripción:{" "}
                        {r.descripcion}
                      </Text>
                    ))}
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 16,
    color: "#1A9888",
  },
  button: {
    backgroundColor: "#49AF4E",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  buttonText: { color: "#fff", fontSize: 16, textAlign: "center" },
  error: { color: "red", marginVertical: 8 },
  guiaBlock: {
    marginBottom: 18,
    padding: 8,
    backgroundColor: "#F4FFF4",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#49AF4E",
  },
  guiaHeaderTouchable: { paddingVertical: 8 },
  guiaHeader: { fontSize: 16, fontWeight: "bold", color: "#49AF4E" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 18,
    width: "95%",
    maxHeight: "90%",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 12,
    color: "#1A9888",
    textAlign: "center",
  },
  closeModalButton: {
    marginTop: 18,
    backgroundColor: "#49AF4E",
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
  },
  closeModalButtonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  renglonesTable: {
    marginTop: 8,
    backgroundColor: "#fff",
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: "#eee",
  },
  renglonesTitle: { fontWeight: "bold", marginBottom: 4, color: "#1A9888" },
  table: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    marginBottom: 18,
    backgroundColor: "#fff",
    overflow: "hidden",
    elevation: 1,
  },
  tableRowHeader: {
    flexDirection: "row",
    backgroundColor: "#49AF4E",
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  tableHeaderCell: {
    flex: 1,
    color: "#fff",
    fontWeight: "bold",
    padding: 8,
    fontSize: 14,
    textAlign: "center",
  },
  tableRow: { flexDirection: "row", alignItems: "center", minHeight: 36 },
  tableCell: {
    flex: 1,
    padding: 8,
    fontSize: 13,
    color: "#333",
    textAlign: "center",
  },
  rowEven: { backgroundColor: "#e9f7ef" },
  rowOdd: { backgroundColor: "#f2fcf6" },
  rowUno: { backgroundColor: "#f4ca24ff" }, // Amarillo intenso
  rowAmbos: { backgroundColor: "#348f26ff" }, // Verde intenso
  renglonCampo: { fontSize: 13, marginBottom: 1 },
  scanBox: {
    marginTop: 16,
    padding: 10,
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#49AF4E",
    alignItems: "center",
  },
  scanTitle: {
    fontWeight: "bold",
    fontSize: 16,
    color: "#1A9888",
    marginBottom: 8,
  },
  scanInput: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 8,
    fontSize: 15,
    width: "90%",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#bbb",
  },
  scanButton: {
    backgroundColor: "#49AF4E",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 18,
    marginTop: 4,
    elevation: 2,
  },
  scanButtonText: { color: "#fff", fontWeight: "bold", fontSize: 15 },
  scanError: { color: "red", marginTop: 6, fontSize: 14 },
  closeButton: {
    position: "absolute",
    top: 10,
    right: 14,
    zIndex: 10,
    backgroundColor: "#eee",
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 2,
    elevation: 2,
  },
  closeButtonText: {
    fontSize: 22,
    color: "#49AF4E",
    fontWeight: "bold",
  },
  cameraContainer: {
    width: "100%",
    height: 220,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 10,
  },
  cameraView: {
    flex: 1,
    borderRadius: 12,
  },
  closeScannerButton: {
    position: "absolute",
    top: 12,
    right: 18,
    zIndex: 20,
    backgroundColor: "#eee",
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 2,
    elevation: 2,
  },
  closeScannerText: {
    fontSize: 18,
    color: "#f80505ff",
    fontWeight: "bold",
  },
  scannerLabel: {
    position: "absolute",
    top: 10,
    left: 0,
    right: 0,
    textAlign: "center",
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
  comentarioInput: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 8,
    fontSize: 15,
    width: "90%",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#bbb",
    minHeight: 40,
    maxHeight: 80,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f2fcf6",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#49AF4E",
    marginBottom: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 6,
    color: "#333",
    backgroundColor: "transparent",
  },
});

// Utilidades
const transformarNumFactura = (num_factura) => {
  if (!num_factura) return num_factura;

  if (/^A\d{7}$/.test(num_factura)) {
    if (num_factura.startsWith("A2")) {
      return "7" + num_factura.slice(1);
    }
    return String(Number(num_factura.slice(1)));
  }

  if (/^B\d{7}$/.test(num_factura)) {
    const serie = num_factura.slice(1);
    if (serie < "0050000") {
      return "8" + serie;
    }
    return "5" + serie;
  }
  return num_factura;
};
