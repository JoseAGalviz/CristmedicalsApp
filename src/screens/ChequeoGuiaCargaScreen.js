import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Button,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useFocusEffect } from "@react-navigation/native";
import * as Location from "expo-location";

export default function ChequeoGuiaCargaScreen() {
  // Estados
  const [guias, setGuias] = useState([]);
  const [guiasCargadas, setGuiasCargadas] = useState([]);
  const [guiaSeleccionada, setGuiaSeleccionada] = useState(null);
  const [notasVerificadas, setNotasVerificadas] = useState([]);
  const [notaScan, setNotaScan] = useState("");
  const [errorScan, setErrorScan] = useState("");
  const [permission, requestPermission] = useCameraPermissions();
  const [showScanner, setShowScanner] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showComentario, setShowComentario] = useState(false);
  const [comentario, setComentario] = useState("");
  const [jsonGenerado, setJsonGenerado] = useState(null);
  const [coordenada, setCoordenada] = useState(null);
  const [escaneos, setEscaneos] = useState({});
  const [mostrarCargadas, setMostrarCargadas] = useState(false);
  const [detalleFaltantes, setDetalleFaltantes] = useState("");

  // Cargar guías guardadas y procesadas
  const limpiarEscaneos = async () => {
    setEscaneos({});
    setNotasVerificadas([]);
    setErrorScan("");
    setNotaScan("");
    setShowComentario(false);
    setComentario("");
    setDetalleFaltantes("");
    setJsonGenerado(null);
    if (guiaSeleccionada) {
      await AsyncStorage.removeItem(`escaneos_${guiaSeleccionada.numeroCarga}`);
    }
  };
  useEffect(() => {
    cargarGuias();
  }, []);
  useEffect(() => {
    if (!guiaSeleccionada) cargarGuias();
  }, [guiaSeleccionada]);
  useFocusEffect(
    React.useCallback(() => {
      cargarGuias();
    }, [])
  );

  async function cargarGuias() {
    const cargadasVehiculo = await AsyncStorage.getItem("guiasCargadasVehiculo");
    const guiasCargadasVehiculo = cargadasVehiculo ? JSON.parse(cargadasVehiculo) : [];

    const guiasYaChequeadasRaw = await AsyncStorage.getItem("guiasCargadas");
    let guiasYaChequeadas = guiasYaChequeadasRaw ? JSON.parse(guiasYaChequeadasRaw) : [];

    // Elimina guías enviadas hace más de 20 minutos
    const ahora = Date.now();
    const GUARDADA_MAX_AGE_MS = 1200000; // 20 minutos
    const guiasChequeadasFiltradas = guiasYaChequeadas.filter(
      g => !g.timestampEnviada || (ahora - g.timestampEnviada) < GUARDADA_MAX_AGE_MS
    );
    if (guiasChequeadasFiltradas.length !== guiasYaChequeadas.length) {
      await AsyncStorage.setItem("guiasCargadas", JSON.stringify(guiasChequeadasFiltradas));
    }
    guiasYaChequeadas = guiasChequeadasFiltradas;

    const pendientes = guiasCargadasVehiculo.filter(
      g => !guiasYaChequeadas.some(c => String(c.numeroCarga) === String(g.numeroCarga))
    );
    setGuias(pendientes);
    setGuiasCargadas(guiasYaChequeadas);
  }

  // Validación y escaneo manual
  // Validación y escaneo manual
  async function verificarNota() {
    const nota = notaScan.trim();
    if (!nota) return;
    if (
      guiaSeleccionada &&
      guiaSeleccionada.detalle.some((d) => String(d.nota).trim() === nota) &&
      !notasVerificadas.includes(nota)
    ) {
      const nuevasNotas = [nota, ...notasVerificadas];
      setNotasVerificadas(nuevasNotas);
      setErrorScan("");
      if (nuevasNotas.length === guiaSeleccionada.detalle.length) {
        await handleExito();
      }
    } else if (
      guiaSeleccionada &&
      !guiaSeleccionada.detalle.some((d) => String(d.nota).trim() === nota)
    ) {
      setErrorScan("¡La nota no pertenece a esta guía!");
    }
    setNotaScan("");
  }

  // Función para verificar escaneo manual
  function verificarScan() {
    const valorOriginal = notaScan.trim();
    if (!valorOriginal) return;
    const valor = transformarNumFactura(valorOriginal);
    const ahora = new Date().toISOString();
    let encontrado = false;
    let nuevoEscaneos = { ...escaneos };
    guiaSeleccionada.detalle.forEach((item, idx) => {
      if (String(item.factura || "").trim() === valor) {
        nuevoEscaneos[idx] = {
          ...(nuevoEscaneos[idx] || {}),
          factura: true,
          fechaFactura: nuevoEscaneos[idx]?.fechaFactura || ahora,
        };
        encontrado = true;
        Alert.alert(
          "Escaneo exitoso",
          `Factura ${valor} registrada correctamente.`
        );
      }
      if (String(item.nota || "").trim() === valor) {
        nuevoEscaneos[idx] = {
          ...(nuevoEscaneos[idx] || {}),
          nota: true,
          fechaNota: nuevoEscaneos[idx]?.fechaNota || ahora,
        };
        encontrado = true;
        Alert.alert(
          "Escaneo exitoso",
          `Nota ${valor} registrada correctamente.`
        );
      }
    });
    if (encontrado) {
      setEscaneos(nuevoEscaneos);
      setErrorScan("");
      const completos = guiaSeleccionada.detalle.every(
        (_, idx) => nuevoEscaneos[idx]?.factura && nuevoEscaneos[idx]?.nota
      );
      if (completos) handleExito();
    } else {
      setErrorScan(
        "¡El valor no pertenece a ninguna factura o nota de esta guía!"
      );
      Alert.alert(
        "Error de escaneo",
        "El valor no pertenece a ninguna factura o nota de esta guía."
      );
    }
    setNotaScan("");
  }

  // Escaneo con cámara
  function handleBarCodeScanned({ data }) {
    const valorOriginal = data.trim();
    const valor = transformarNumFactura(valorOriginal);
    const ahora = new Date().toISOString();
    let yaEscaneado = false;
    guiaSeleccionada.detalle.forEach((item, idx) => {
      if (
        (String(item.factura || "").trim() === valor &&
          escaneos[idx]?.factura) ||
        (String(item.nota || "").trim() === valor && escaneos[idx]?.nota)
      ) {
        yaEscaneado = true;
      }
    });
    if (yaEscaneado) {
      Alert.alert("Escaneo duplicado", "Este código ya fue registrado.");
      setScanned(true);
      setTimeout(() => setScanned(false), 1500);
      return;
    }
    setScanned(true);
    setLoading(true);
    setErrorScan("");
    let encontrado = false;
    let nuevoEscaneos = { ...escaneos };
    guiaSeleccionada.detalle.forEach((item, idx) => {
      if (String(item.factura || "").trim() === valor) {
        nuevoEscaneos[idx] = {
          ...(nuevoEscaneos[idx] || {}),
          factura: true,
          fechaFactura: nuevoEscaneos[idx]?.fechaFactura || ahora,
        };
        encontrado = true;
        Alert.alert(
          "Escaneo exitoso",
          `Factura ${valor} registrada correctamente.`
        );
      }
      if (String(item.nota || "").trim() === valor) {
        nuevoEscaneos[idx] = {
          ...(nuevoEscaneos[idx] || {}),
          nota: true,
          fechaNota: nuevoEscaneos[idx]?.fechaNota || ahora,
        };
        encontrado = true;
        Alert.alert(
          "Escaneo exitoso",
          `Nota ${valor} registrada correctamente.`
        );
      }
    });
    if (encontrado) {
      setEscaneos(nuevoEscaneos);
      setErrorScan("");
      // Verifica si todos los ítems están completos y muestra el comentario
      const completos = guiaSeleccionada.detalle.every(
        (_, idx) => nuevoEscaneos[idx]?.factura && nuevoEscaneos[idx]?.nota
      );
      if (completos) handleExito();
    } else {
      setErrorScan(
        "¡El valor no pertenece a ninguna factura o nota de esta guía!"
      );
      Alert.alert(
        "Error de escaneo",
        "El valor no pertenece a ninguna factura o nota de esta guía."
      );
    }
    setNotaScan("");
    setLoading(false);
    setTimeout(() => setShowScanner(false), 800);
    setTimeout(() => setScanned(false), 1500);
  }

  // Lógica de éxito al completar todas las facturas
  async function handleExito() {
    // Calcula faltantes
    const faltantes = guiaSeleccionada.detalle
      .map((item, idx) => {
        const escaneo = escaneos[idx] || {};
        let partesFaltantes = [];
        if (!escaneo.factura)
          partesFaltantes.push(`Factura: ${item.factura ?? "N/A"}`);
        if (!escaneo.nota)
          partesFaltantes.push(`Nota: ${item.nota ?? "N/A"}`);
        if (partesFaltantes.length > 0) {
          return `- ${partesFaltantes.join(" | ")} | Descripción: ${item.descrip ?? ""
            }`;
        }
        return null;
      })
      .filter(Boolean);

    let detalle = "";
    if (faltantes.length > 0) {
      detalle = "Faltantes:\n" + faltantes.join("\n");
    } else {
      detalle = "Todos los pedidos/facturas están completos.";
    }
    setDetalleFaltantes(detalle);

    await obtenerUbicacionYContinuar(() => {
      setShowComentario(true);
      Alert.alert("Éxito", "¡Todas las facturas han sido escaneadas!");
    });
  }

  // Enviar JSON al endpoint y actualizar estado local
  async function enviarDatos() {
    if (!guiaSeleccionada) return;
    const cargado = guiaSeleccionada.cargado?.[0] || {};
    let coordenadaStr = "";
    if (coordenada && coordenada.lat && coordenada.lng) {
      coordenadaStr = `${coordenada.lat},${coordenada.lng}`;
    }
    function formatFecha(fechaIso) {
      const d = new Date(fechaIso);
      const pad = (n) => (n < 10 ? "0" + n : n);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
        d.getDate()
      )} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }
    const fecha = formatFecha(new Date().toISOString());
    const detalle = guiaSeleccionada.detalle.map((item) => ({
      factura: item.factura,
      nota: item.nota,
      paquetes: item.paquetes,
      descrip: item.descrip,
      vendedor: item.vendedor ?? "",
      responsable: item.responsable ?? "",
      id_ca: guiaSeleccionada.numeroCarga,
    }));
    const cargadoArr = [
      {
        ruta: cargado.ruta ?? "",
        conductor: cargado.conductor ?? "",
        vehiculo: cargado.vehiculo ?? "",
        realizado: cargado.realizado ?? "",
      },
    ];
    let resumenPedidos = "";
    guiaSeleccionada.detalle.forEach((item, idx) => {
      const escaneo = escaneos[idx] || {};
      let partesFaltantes = [];
      if (!escaneo.factura)
        partesFaltantes.push(`Factura: ${item.factura ?? "N/A"}`);
      if (!escaneo.nota) partesFaltantes.push(`Nota: ${item.nota ?? "N/A"}`);
      if (partesFaltantes.length > 0) {
        resumenPedidos += `- ${partesFaltantes.join(" | ")} | Descripción: ${item.descrip ?? ""
          }\n`;
      }
    });
    if (!resumenPedidos)
      resumenPedidos = "Todos los pedidos/facturas están completos.";
    const comentarioFinal = comentario
      ? `${comentario}\n\nDetalle de faltantes:\n${resumenPedidos}`
      : `Detalle de faltantes:\n${resumenPedidos}`;
    const json = {
      num_guia: guiaSeleccionada.numeroCarga,
      conductor: cargado.conductor ?? "",
      ruta: cargado.ruta ?? "",
      vehiculo: cargado.vehiculo ?? "",
      comentario: comentarioFinal,
      estatus: "completado",
      coordenada: coordenadaStr,
      fecha: fecha,
    };
    console.log("JSON enviado al endpoint:", JSON.stringify(json, null, 2));
    try {
      const response = await fetch(
        "https://98.94.185.164.nip.io/api/guias/procesar",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(json),
        }
      );
      const result = await response.json();
      if (result.exito === true) {
        Alert.alert(
          "Datos cargados exitosamente",
          result.mensaje ?? "La guía fue procesada correctamente."
        );
        await actualizarGuiasLocalesDespuesDeCarga(
          guiaSeleccionada.numeroCarga,
          comentario
        );
        setShowComentario(false);
        setGuiaSeleccionada(null); // <-- Esto regresa a la lista
        setNotasVerificadas([]);
        setNotaScan("");
        setJsonGenerado(null);
        setCoordenada(null);
        await cargarGuias(); // <-- Refresca la lista de guías pendientes y cargadas
      } else {
        Alert.alert("Error al cargar", result.error ?? "Ocurrió un error", [
          {
            text: "Detalle",
            onPress: () => Alert.alert("Detalle", result.detalle ?? ""),
          },
        ]);
      }
    } catch (e) {
      Alert.alert("Error de red", "No se pudo conectar con el servidor.");
    }
  }
  async function obtenerUbicacionYContinuar(callback) {
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permiso denegado",
          "No se pudo obtener la ubicación porque no diste permiso."
        );
        return;
      }
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      if (!location || !location.coords) {
        Alert.alert(
          "Ubicación no disponible",
          "Activa el GPS y verifica tu señal."
        );
        return;
      }
      const coords = {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        accuracy: location.coords.accuracy,
      };
      setCoordenada(coords);
      if (callback) callback();
    } catch (e) {
      Alert.alert("Error", "No se pudo obtener la ubicación.");
    }
  }
  // Actualiza guiasGuardadas y guiasCargadas en AsyncStorage
  async function actualizarGuiasLocalesDespuesDeCarga(numeroCarga, comentario) {
    // Elimina de guiasGuardadas
    const guiasGuardadas = await AsyncStorage.getItem("guiasGuardadas");
    let nuevasGuiasGuardadas = [];
    let guiaProcesada = null;
    if (guiasGuardadas) {
      nuevasGuiasGuardadas = JSON.parse(guiasGuardadas).filter((g) => {
        if (String(g.numeroCarga) === String(numeroCarga)) {
          guiaProcesada = { ...g, comentario, registrada: true };
          return false;
        }
        return true;
      });
      await AsyncStorage.setItem(
        "guiasGuardadas",
        JSON.stringify(nuevasGuiasGuardadas)
      );
    }

    // Elimina de guiasCargadasVehiculo
    const guiasCargadasVehiculo = await AsyncStorage.getItem("guiasCargadasVehiculo");
    if (guiasCargadasVehiculo) {
      const nuevasGuiasCargadasVehiculo = JSON.parse(guiasCargadasVehiculo).filter(
        (g) => String(g.numeroCarga) !== String(numeroCarga)
      );
      await AsyncStorage.setItem(
        "guiasCargadasVehiculo",
        JSON.stringify(nuevasGuiasCargadasVehiculo)
      );
    }

    // Agrega a guiasCargadas
    if (guiaProcesada) {
      const guiasCargadas = await AsyncStorage.getItem("guiasCargadas");
      let nuevasGuiasCargadas = guiasCargadas ? JSON.parse(guiasCargadas) : [];
      nuevasGuiasCargadas = nuevasGuiasCargadas.filter(
        (g) => String(g.numeroCarga) !== String(numeroCarga)
      );
      guiaProcesada.timestampEnviada = Date.now(); // <-- Guarda el timestamp de envío
      nuevasGuiasCargadas.push(guiaProcesada);
      await AsyncStorage.setItem(
        "guiasCargadas",
        JSON.stringify(nuevasGuiasCargadas)
      );
      setGuiasCargadas(nuevasGuiasCargadas);
      await AsyncStorage.removeItem(`escaneos_${numeroCarga}`);
    }
  }

  useEffect(() => {
    if (guiaSeleccionada) {
      AsyncStorage.setItem(
        `escaneos_${guiaSeleccionada.numeroCarga}`,
        JSON.stringify(escaneos)
      );
    }
  }, [escaneos, guiaSeleccionada]);

  // Para volver a la lista de guías
  function volver() {
    setGuiaSeleccionada(null);
    setNotasVerificadas([]);
    setNotaScan("");
    setErrorScan("");
    setShowComentario(false);
    setComentario("");
    setJsonGenerado(null);
    setCoordenada(null);
  }

  // Validar que no se pueda volver a cargar la misma guía
  function esGuiaProcesada(numeroCarga) {
    return guiasCargadas.some(
      (g) => String(g.numeroCarga) === String(numeroCarga)
    );
  }

  // Eliminar guía cargada
  async function eliminarGuiaCargada(numeroCarga) {
    try {
      const guiasCargadas = await AsyncStorage.getItem("guiasCargadas");
      let nuevasGuiasCargadas = [];
      if (guiasCargadas) {
        nuevasGuiasCargadas = JSON.parse(guiasCargadas).filter(
          (g) => String(g.numeroCarga) !== String(numeroCarga)
        );
        await AsyncStorage.setItem(
          "guiasCargadas",
          JSON.stringify(nuevasGuiasCargadas)
        );
        setGuiasCargadas(nuevasGuiasCargadas);
      }
    } catch (e) {
      Alert.alert("Error", "No se pudo eliminar la guía cargada.");
    }
  }

  // Render principal
  if (!guiaSeleccionada) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Entrega de mercancía</Text>
        <View style={{ marginBottom: 10 }}>
          <TouchableOpacity
            style={{
              backgroundColor: "#49AF4E",
              borderRadius: 8,
              paddingVertical: 10,
              paddingHorizontal: 18,
              alignSelf: "center",
              marginBottom: 6,
              elevation: 2,
              flexDirection: "row",
              alignItems: "center",
            }}
            onPress={() => setMostrarCargadas(!mostrarCargadas)}
          >
            <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 16 }}>
              {mostrarCargadas ? "Ocultar" : "Ver"} Guías Cargadas
            </Text>
          </TouchableOpacity>
          {mostrarCargadas && (
            <FlatList
              data={guiasCargadas}
              keyExtractor={(item, idx) => String(item.numeroCarga) + idx}
              ListEmptyComponent={
                <Text style={styles.empty}>No hay guías cargadas.</Text>
              }
              renderItem={({ item }) => (
                <View style={styles.guiaItemCargada}>
                  <Text style={styles.guiaText}>Guía #{item.numeroCarga}</Text>
                  <Text style={styles.guiaSubText}>
                    Registrada el {item.fechaGuardado} a las {item.horaGuardado}
                  </Text>
                  <Text style={styles.guiaSubText}>
                    Comentario: {item.comentario ?? "Sin comentario"}
                  </Text>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => eliminarGuiaCargada(item.numeroCarga)}
                  >
                    <Text style={styles.deleteButtonText}>Eliminar</Text>
                  </TouchableOpacity>
                </View>
              )}
            />
          )}
        </View>
        <Text style={styles.labelPendientes}>Guías por entregar</Text>
        <FlatList
          data={guias}
          keyExtractor={(item, idx) => String(item.numeroCarga) + idx}
          ListEmptyComponent={
            <Text style={styles.empty}>No hay guías pendientes.</Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.guiaItem,
                esGuiaProcesada(item.numeroCarga) &&
                styles.guiaItemDeshabilitada,
              ]}
              onPress={async () => {
                if (!esGuiaProcesada(item.numeroCarga)) {
                  setGuiaSeleccionada(item);
                  // Solo recupera escaneos si la guía NO está procesada
                  const saved = await AsyncStorage.getItem(`escaneos_${item.numeroCarga}`);
                  setEscaneos(saved ? JSON.parse(saved) : {});
                  setShowComentario(false);
                  setDetalleFaltantes("");
                  setComentario("");
                  setNotasVerificadas([]);
                  setNotaScan("");
                  setErrorScan("");
                  setJsonGenerado(null);
                  setCoordenada(null);
                }
              }}
              disabled={esGuiaProcesada(item.numeroCarga)}
            >
              <Text style={styles.guiaText}>Guía #{item.numeroCarga}</Text>
              <Text style={styles.guiaSubText}>
                Guardada el {item.fechaGuardado} a las {item.horaGuardado}
              </Text>
              <Text style={styles.guiaSubText}>
                Pedidos: {item.detalle?.length || 0}
              </Text>
              {esGuiaProcesada(item.numeroCarga) && (
                <Text
                  style={{ color: "#d9534f", fontWeight: "bold", marginTop: 4 }}
                >
                  Ya registrada
                </Text>
              )}
            </TouchableOpacity>
          )}
        />
      </View>
    );
  }

  // Vista de escaneo con cámara
  if (showScanner) {
    if (!permission) {
      return <Text>Solicitando permiso de cámara...</Text>;
    }
    if (!permission.granted) {
      return (
        <View style={styles.centered}>
          <Text>No se concedió acceso a la cámara.</Text>
          <Button title="Permitir cámara" onPress={requestPermission} />
        </View>
      );
    }
    return (
      <View style={styles.container}>
        <CameraView
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          style={StyleSheet.absoluteFillObject}
        />
        {loading && (
          <View style={styles.overlay}>
            <ActivityIndicator size="large" color="#007bff" />
            <Text>Procesando escaneo...</Text>
          </View>
        )}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => setShowScanner(false)}
        >
          <Text style={styles.backButtonText}>Cancelar</Text>
        </TouchableOpacity>
        {errorScan ? (
          <View style={styles.result}>
            <Text
              style={{
                color: "#d9534f",
                fontWeight: "bold",
                alignSelf: "center",
                marginBottom: 6,
              }}
            >
              {errorScan}
            </Text>
          </View>
        ) : null}
      </View>
    );
  }

  // Ordenar: primero los registros donde se haya escaneado factura o nota recientemente
  const indicesEscaneados = Object.keys(escaneos)
    .filter((idx) => escaneos[idx]?.factura || escaneos[idx]?.nota)
    .map((idx) => parseInt(idx));

  const detalleOrdenado = [
    // Primero los escaneados (en orden inverso para que el último escaneado quede arriba)
    ...indicesEscaneados
      .reverse()
      .map((idx) => ({ ...guiaSeleccionada.detalle[idx], _idx: idx })),
    // Luego los no escaneados
    ...guiaSeleccionada.detalle
      .map((item, idx) => ({ ...item, _idx: idx }))
      .filter((item) => !indicesEscaneados.includes(item._idx)),
  ];

  // Vista de detalle y verificación de notas
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
    >
      <View style={styles.container}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <TouchableOpacity onPress={volver}>
            <Text
              style={{ color: "#1A9888", marginBottom: 10, fontWeight: "bold" }}
            >
              ← Volver
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.escobaButton}
            onPress={limpiarEscaneos}
            activeOpacity={0.8}
          >
            {/* Icono de escoba unicode, puedes cambiar por un icono de vector si usas react-native-vector-icons */}
            <Text style={{ fontSize: 24 }}>🧹</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.pedidosCount}>
          Cantidad de pedidos:{" "}
          <Text style={styles.pedidosCountNumber}>
            {guiaSeleccionada.detalle.length}
          </Text>
        </Text>

        {/* Cámara solo visible si la guía no está completa */}
        {(() => {
          const total = guiaSeleccionada.detalle.length;
          const completos = guiaSeleccionada.detalle.filter(
            (_, idx) => escaneos[idx]?.factura && escaneos[idx]?.nota
          ).length;
          if (completos !== total && !showComentario) {
            // <-- agrega !showComentario
            return (
              <View style={styles.cameraContainer}>
                <CameraView
                  onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                  style={styles.camera}
                />
                {loading && (
                  <View style={styles.overlay}>
                    <ActivityIndicator size="large" color="#007bff" />
                    <Text>Procesando escaneo...</Text>
                  </View>
                )}
              </View>
            );
          }
          return null;
        })()}
        {errorScan ? (
          <Text
            style={{
              color: "#d9534f",
              fontWeight: "bold",
              alignSelf: "center",
              marginBottom: 6,
            }}
          >
            {errorScan}
          </Text>
        ) : null}
        {/* Input y tabla SOLO si NO está mostrando comentario */}
        {!showComentario && (
          <>
            <TextInput
              style={styles.input}
              placeholder="Escanea o ingresa Factura o N° Nota"
              value={notaScan}
              onChangeText={setNotaScan}
              onSubmitEditing={verificarScan}
              keyboardType="numeric"
              returnKeyType="done"
              editable={!showComentario}
            />
            <ScrollView
              style={{ width: "100%" }}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.table}>
                <View style={styles.tableRowHeader}>
                  <Text style={styles.tableHeaderCell}>Factura / N° Nota</Text>
                  <Text style={styles.tableHeaderCell}>Paquetes</Text>
                  <Text style={styles.tableHeaderCell}>Descripción</Text>
                </View>
                {detalleOrdenado.map((item, idx) => {
                  const escaneo = escaneos[item._idx] || {};
                  let rowStyle = styles.tableRow;
                  if (escaneo.factura && escaneo.nota)
                    rowStyle = [styles.tableRow, styles.rowAmbos];
                  else if (escaneo.factura || escaneo.nota)
                    rowStyle = [styles.tableRow, styles.rowUno];
                  else
                    rowStyle = [
                      styles.tableRow,
                      item._idx % 2 === 0 ? styles.rowEven : styles.rowOdd,
                    ];

                  return (
                    <View key={item._idx} style={rowStyle}>
                      <Text
                        style={[
                          styles.tableCell,
                          escaneo.factura ? styles.cellFactura : null,
                          escaneo.nota ? styles.cellNota : null,
                          escaneo.factura && escaneo.nota ? styles.cellAmbos : null,
                        ]}
                      >
                        <Text style={escaneo.factura ? styles.cellFactura : null}>
                          {item.factura}
                        </Text>
                        {" / "}
                        <Text style={escaneo.nota ? styles.cellNota : null}>
                          {item.nota}
                        </Text>
                      </Text>
                      <Text style={styles.tableCell}>{item.paquetes}</Text>
                      <Text style={styles.tableCell}>{item.descrip.trim()}</Text>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
            <Text
              style={{
                marginTop: 10,
                color:
                  notasVerificadas.length === guiaSeleccionada.detalle.length
                    ? "#49AF4E"
                    : "#d9534f",
                fontWeight: "bold",
                alignSelf: "center",
              }}
            >
              {
                // Calcula cuántos registros están completos (factura y nota)
                (() => {
                  const total = guiaSeleccionada.detalle.length;
                  const completos = guiaSeleccionada.detalle.filter(
                    (_, idx) => escaneos[idx]?.factura && escaneos[idx]?.nota
                  ).length;
                  return completos === total
                    ? "¡Guía COMPLETA!"
                    : `Notas verificadas: ${completos} / ${total}`;
                })()
              }
            </Text>
          </>
        )}

        {/* Input para comentario y botón para enviar datos */}
        {showComentario && (
          <View style={[styles.comentarioBox, { flex: 1 }]}>
            {detalleFaltantes && (
              <ScrollView
                style={{ maxHeight: 250 }}
                contentContainerStyle={{ flexGrow: 1 }}
              >
                <View style={{ marginBottom: 8 }}>
                  <Text style={{ fontWeight: "bold", color: "#d9534f" }}>
                    Detalle de faltantes:
                  </Text>
                  <Text
                    style={{
                      backgroundColor: "#f2fcf6",
                      padding: 8,
                      borderRadius: 6,
                      color: "#333",
                    }}
                  >
                    {detalleFaltantes}
                  </Text>
                </View>
              </ScrollView>
            )}
            <Text style={{ fontWeight: "bold", marginBottom: 8, marginTop: 8 }}>
              {
                // Si no hay faltantes, cambia el label
                detalleFaltantes && detalleFaltantes.trim() !== "Todos los pedidos/facturas están completos."
                  ? "Motivo de faltante:"
                  : "Descripción o comentario:"
              }
            </Text>
            <TextInput
              style={[styles.input, { marginBottom: 16 }]}
              placeholder="Motivo"
              value={comentario}
              onChangeText={setComentario}
              multiline
              textAlignVertical="top"
            />
            <TouchableOpacity style={styles.saveButton} onPress={enviarDatos}>
              <Text style={[styles.saveButtonText, { color: "#fff" }]}>
                Enviar datos
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Agrega el botón para registrar guía incompleta antes del comentario */}
        {!showComentario && (
          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: "#FFD600" }]}
            onPress={() => {
              // Generar detalle exacto de faltantes
              const faltantes = guiaSeleccionada.detalle
                .map((item, idx) => {
                  const escaneo = escaneos[idx] || {};
                  let partesFaltantes = [];
                  if (!escaneo.factura)
                    partesFaltantes.push(`Factura: ${item.factura ?? "N/A"}`);
                  if (!escaneo.nota)
                    partesFaltantes.push(`Nota: ${item.nota ?? "N/A"}`);
                  if (partesFaltantes.length > 0) {
                    return `- ${partesFaltantes.join(" | ")} | Descripción: ${item.descrip ?? ""
                      }`;
                  }
                  return null;
                })
                .filter(Boolean);

              let detalle = "";
              if (faltantes.length > 0) {
                detalle = "Faltantes:\n" + faltantes.join("\n");
              } else {
                detalle = "Todos los pedidos/facturas están completos.";
              }

              setDetalleFaltantes(detalle);

              Alert.alert(
                "Registrar guía incompleta",
                "¿Seguro que deseas registrar la guía aunque no esté completa?",
                [
                  { text: "Cancelar", style: "cancel" },
                  {
                    text: "Registrar",
                    style: "destructive",
                    onPress: () => {
                      setShowScanner(false); // Cierra la cámara
                      obtenerUbicacionYContinuar(() => {
                        setComentario("");
                        setShowComentario(true);
                        // No necesitas Alert aquí, ya que el detalle se muestra en pantalla
                      });
                    },
                  },
                ]
              );
            }}
          >
            <Text style={[styles.saveButtonText, { color: "#333" }]}>
              Registrar guía incompleta
            </Text>
          </TouchableOpacity>
        )}

        {/* Mostrar el JSON generado */}
        {jsonGenerado && (
          <View style={styles.jsonBox}>
            <Text style={{ fontWeight: "bold", marginBottom: 6 }}>
              JSON generado:
            </Text>
            <Text style={{ fontSize: 13, color: "#333" }}>
              {JSON.stringify(jsonGenerado, null, 2)}
            </Text>
          </View>
        )}
        {/* ...el resto del código... */}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f9fa", padding: 16 },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#1A9888",
    marginBottom: 10,
    alignSelf: "center",
  },
  guiaItem: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#000000ff",
  },
  guiaText: { fontWeight: "bold", fontSize: 17, color: "#1046e7ff" },
  guiaSubText: {
    color: "#175a05ff",
    fontSize: 14,
    marginTop: 2,
    marginBottom: 4,
  },
  empty: {
    color: "#888",
    fontStyle: "italic",
    alignSelf: "center",
    marginTop: 40,
  },
  pedidosCount: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
    backgroundColor: "#49AF4E",
    paddingVertical: 6,
    paddingHorizontal: 18,
    borderRadius: 20,
    alignSelf: "center",
    marginBottom: 8,
    marginTop: 8,
    elevation: 2,
  },
  pedidosCountNumber: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 20,
  },
  input: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#1A9888",
    marginBottom: 10,
    marginTop: 5,
  },
  scanButton: {
    backgroundColor: "#007bff",
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 8,
    elevation: 2,
    marginBottom: 10,
    alignSelf: "center",
  },
  scanButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    letterSpacing: 1,
  },
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
  rowChecked: { backgroundColor: "#1A9888" },
  rowUno: { backgroundColor: "#FFD600" }, // Amarillo si solo uno escaneado
  rowAmbos: { backgroundColor: "#49AF4E" }, // Verde si ambos escaneados
  cellFactura: { color: "#007bff", fontWeight: "bold" }, // Azul para factura escaneada
  cellNota: { color: "#FF3B30", fontWeight: "bold" }, // Rojo para nota escaneada
  cellAmbos: { color: "#fff", fontWeight: "bold" }, // Blanco si ambos escaneados
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#f7f9fa",
  },
  backButton: {
    marginTop: 24,
    backgroundColor: "#888",
    paddingVertical: 10,
    paddingHorizontal: 32,
    borderRadius: 8,
    elevation: 2,
    alignSelf: "center",
  },
  backButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  result: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.95)",
    padding: 16,
    borderRadius: 8,
    marginHorizontal: 16,
  },
  comentarioBox: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 16,
    marginTop: 12,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  saveButton: {
    backgroundColor: "#49AF4E",
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignSelf: "center",
    marginTop: -20,
    elevation: 1,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  saveButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
  jsonBox: {
    backgroundColor: "#f7f9fa",
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
    elevation: 1,
    borderWidth: 1,
    borderColor: "#bbb",
  },
  escobaButton: {
    backgroundColor: "transparent",
    padding: 4,
    borderRadius: 20,
    marginLeft: 8,
    marginTop: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  labelCargadas: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#49AF4E",
    marginTop: 10,
    marginBottom: 4,
    alignSelf: "center",
  },
  labelPendientes: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#d9534f",
    marginTop: 18,
    marginBottom: 4,
    alignSelf: "center",
  },
  guiaItemCargada: {
    backgroundColor: "#e9f7ef",
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#49AF4E",
  },
  guiaItemDeshabilitada: {
    opacity: 0.5,
  },
  deleteButton: {
    backgroundColor: "#d9534f",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 18,
    alignSelf: "center",
    marginTop: 10,
    elevation: 2,
  },
  deleteButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 15,
  },
  cameraContainer: {
    width: "100%",
    height: 180,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 12,
    backgroundColor: "#000",
    alignSelf: "center",
    justifyContent: "center",
    alignItems: "center",
  },
  camera: {
    width: "100%",
    height: "100%",
    borderRadius: 12,
  },
});

function transformarNumFactura(num_factura) {
  if (num_factura === null || num_factura === undefined) return '';
  let str = String(num_factura).trim().toUpperCase();

  if (/^A\d{7}$/.test(str)) {
    if (str.startsWith("A2")) {
      return "7" + str.slice(1);
    }
    return String(Number(str.slice(1)));
  }
  if (/^B\d{7}$/.test(str)) {
    const serie = str.slice(1);
    if (serie < "0050000") {
      return "8" + serie;
    }
    return "5" + serie;
  }

  // Normalización numérica genérica: quitar ceros a la izquierda
  if (/^\d+$/.test(str)) {
    return String(Number(str));
  }

  return str;
}
