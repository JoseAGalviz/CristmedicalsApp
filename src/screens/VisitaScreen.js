import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Alert,
  Modal,
  ScrollView,
  Linking,
  Platform,
  KeyboardAvoidingView
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { showMessage } from "react-native-flash-message";

// ===== CONSTANTES Y CONFIGURACIÓN =====
const API_URL = "https://98.94.185.164.nip.io/api/gestiones";

const RADIO_OPTIONS = [
  { label: "Venta", value: "venta" },
  { label: "Cobranza", value: "cobranza" },
  { label: "Nuevo Cliente", value: "nuevo_cliente" },
];

const RADIO_TIPO_GESTION = [
  { label: "Concretada", value: "concretada", color: "#49AF4E" },
  { label: "En Proceso", value: "en_proceso", color: "#FFD600" },
  { label: "Negativa", value: "negativa", color: "#FF3B30" },
];

const StorageKeys = {
  CLIENTES: "clientes",
  GESTIONES: "gestiones",
  USER_DATA: "userData"
};

const GestionTypes = {
  VENTA: "venta",
  COBRANZA: "cobranza",
  NUEVO_CLIENTE: "nuevo_cliente"
};

const Colors = {
  PRIMARY: "#1A9888",
  SECONDARY: "#49AF4E",
  WARNING: "#FFD600",
  ERROR: "#FF3B30",
  BACKGROUND: "#F8FAFC",
  TEXT: "#333333",
  LIGHT_TEXT: "#888888",
  WHITE: "#FFFFFF",
  LIGHT_BACKGROUND: "#E3F6F2",
  DARK_YELLOW: "#FFC107"
};

// ===== COMPONENTES DE UI REUTILIZABLES =====
const RadioButton = ({ label, value, selected, onSelect, color }) => (
  <TouchableOpacity 
    style={styles.radioOption} 
    onPress={onSelect} 
    activeOpacity={0.7}
    accessibilityLabel={`Opción ${label}`}
    accessibilityState={{ checked: selected }}
  >
    <View style={[
      styles.radioCircle, 
      selected && (color ? { backgroundColor: color, borderColor: color } : styles.radioCircleSelected)
    ]} />
    <Text style={styles.radioLabel}>{label}</Text>
  </TouchableOpacity>
);

const InputWithIcon = ({ 
  iconName, 
  placeholder, 
  value, 
  onChangeText, 
  keyboardType = "default",
  editable = true,
  accessibilityLabel 
}) => (
  <View style={styles.inputIconRow}>
    <Ionicons name={iconName} size={20} color={Colors.PRIMARY} style={styles.inputIcon} />
    <TextInput
      style={[styles.input, { flex: 1 }]}
      placeholder={placeholder}
      value={value}
      onChangeText={onChangeText}
      keyboardType={keyboardType}
      placeholderTextColor={Colors.LIGHT_TEXT}
      editable={editable}
      accessibilityLabel={accessibilityLabel}
    />
  </View>
);

const ActionButton = ({ onPress, text, backgroundColor = Colors.PRIMARY, disabled = false }) => (
  <TouchableOpacity
    style={[styles.actionButton, { backgroundColor }, disabled && styles.buttonDisabled]}
    onPress={onPress}
    disabled={disabled}
    accessibilityLabel={text}
  >
    <Text style={styles.actionButtonText}>{text}</Text>
  </TouchableOpacity>
);

// ===== HOOKS PERSONALIZADOS =====
const useClientes = () => {
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const filteredClientes = useMemo(() => {
    if (!search) return clientes;
    return clientes.filter(cliente =>
      // Soporta tanto gestiones como bitrix
      (cliente.cli_des || cliente.TITLE || "").toLowerCase().includes(search.toLowerCase())
    );
  }, [search, clientes]);

  useEffect(() => {
    const fetchClientes = async () => {
      setLoading(true);
      try {
        const localClientes = await AsyncStorage.getItem(StorageKeys.CLIENTES);
        const bitrixClientes = await AsyncStorage.getItem('clientes_bitrix');
        let parsedClientes = [];
        if (localClientes) {
          parsedClientes = JSON.parse(localClientes);
        }
        let parsedBitrix = [];
        if (bitrixClientes) {
          parsedBitrix = JSON.parse(bitrixClientes);
          // Normaliza los clientes bitrix para que tengan las mismas claves
          parsedBitrix = parsedBitrix.map(b => ({
            co_cli: b.ID,
            cli_des: b.TITLE,
            tipo: "bitrix"
          }));
        }
        setClientes([...parsedClientes, ...parsedBitrix]);
      } catch (error) {
        console.error("Error fetching clients:", error);
        setClientes([]);
      } finally {
        setLoading(false);
      }
    };

    fetchClientes();
  }, []);

  return { clientes, loading, search, setSearch, filteredClientes };
};

const useGestiones = () => {
  const [gestiones, setGestiones] = useState([]);

  useEffect(() => {
    loadGestiones();
  }, []);

  const loadGestiones = async () => {
    try {
      const data = await AsyncStorage.getItem(StorageKeys.GESTIONES);
      if (data) {
        const gestionesOrdenadas = JSON.parse(data).sort(
          (a, b) => new Date(b.fecha) - new Date(a.fecha)
        );
        setGestiones(gestionesOrdenadas);
      }
    } catch (error) {
      console.error("Error loading gestiones:", error);
    }
  };

  const saveGestiones = async (newGestiones) => {
    try {
      await AsyncStorage.setItem(StorageKeys.GESTIONES, JSON.stringify(newGestiones));
      setGestiones(newGestiones);
    } catch (error) {
      console.error("Error saving gestiones:", error);
      throw new Error("No se pudieron guardar las gestiones");
    }
  };

  const addGestion = async (nuevaGestion) => {
    try {
      const todas = [...gestiones, nuevaGestion];
      await saveGestiones(todas); // Guarda el array completo en AsyncStorage
      return todas;
    } catch (error) {
      console.error("Error adding gestion:", error);
      throw error;
    }
  };

  const deleteGestion = async (id) => {
    try {
      const nuevas = gestiones.filter(g => g.id !== id);
      await saveGestiones(nuevas);
    } catch (error) {
      console.error("Error deleting gestion:", error);
      throw error;
    }
  };

  const deleteGestionesEnviadas = async () => {
    try {
      const nuevas = gestiones.filter(g => !g.enviada);
      await saveGestiones(nuevas);
    } catch (error) {
      console.error("Error deleting sent gestiones:", error);
      throw error;
    }
  };

  return {
    gestiones,
    addGestion,
    deleteGestion,
    deleteGestionesEnviadas,
    loadGestiones
  };
};

// ===== UTILIDADES =====
const obtenerUbicacion = async () => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permiso de ubicación requerido",
        "Debes otorgar permisos de ubicación para registrar una gestión.",
        [
          {
            text: "Ir a configuración",
            onPress: () => {
              if (Platform.OS === "ios") {
                Linking.openURL("app-settings:");
              } else {
                Linking.openSettings();
              }
            },
          },
          { text: "Cancelar", style: "cancel" },
        ]
      );
      return null;
    }
    
    return await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced, // Mejor balance entre precisión y consumo
    });
  } catch (error) {
    Alert.alert("No se pudo obtener la ubicación");
    return null;
  }
};

// ===== COMPONENTE PRINCIPAL =====
export default function VisitaScreen() {
  const { clientes, loading, search, setSearch, filteredClientes } = useClientes();
  const { gestiones, addGestion, deleteGestion, deleteGestionesEnviadas, loadGestiones } = useGestiones();
  
  const [selectedCliente, setSelectedCliente] = useState("");
  const [gestionTypes, setGestionTypes] = useState([]);
  const [tipoGestionVenta, setTipoGestionVenta] = useState("");
  const [tipoGestionCobranza, setTipoGestionCobranza] = useState("");
  const [descripcionVenta, setDescripcionVenta] = useState("");
  const [descripcionCobranza, setDescripcionCobranza] = useState("");
  const [showGestionForm, setShowGestionForm] = useState(false);
  const [nuevoNombreFarmacia, setNuevoNombreFarmacia] = useState("");
  const [nuevoResponsable, setNuevoResponsable] = useState("");
  const [nuevoTelefono, setNuevoTelefono] = useState("");
  const [nuevoCodigoSim, setNuevoCodigoSim] = useState("");
  const [showDetalleModal, setShowDetalleModal] = useState(false);
  const [gestionSeleccionada, setGestionSeleccionada] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const limpiarFormulario = useCallback(() => {
    setSelectedCliente("");
    setGestionTypes([]);
    setTipoGestionVenta("");
    setTipoGestionCobranza("");
    setDescripcionVenta("");
    setDescripcionCobranza("");
    setSearch("");
    setNuevoNombreFarmacia("");
    setNuevoResponsable("");
    setNuevoTelefono("");
    setNuevoCodigoSim("");
  }, []);

  const handleToggleGestionType = useCallback((type) => {
    setGestionTypes(prev => {
      if (prev.includes(type)) {
        return prev.filter(v => v !== type);
      }

      // Lógica para combinaciones válidas
      if (type === GestionTypes.NUEVO_CLIENTE) {
        if (prev.includes(GestionTypes.VENTA)) return [GestionTypes.VENTA, GestionTypes.NUEVO_CLIENTE];
        return [GestionTypes.NUEVO_CLIENTE];
      }
      
      if (type === GestionTypes.VENTA) {
        if (prev.includes(GestionTypes.NUEVO_CLIENTE)) return [GestionTypes.VENTA, GestionTypes.NUEVO_CLIENTE];
        if (prev.includes(GestionTypes.COBRANZA)) return [GestionTypes.VENTA, GestionTypes.COBRANZA];
        return [GestionTypes.VENTA];
      }
      
      if (type === GestionTypes.COBRANZA) {
        if (prev.includes(GestionTypes.VENTA)) return [GestionTypes.VENTA, GestionTypes.COBRANZA];
        return [GestionTypes.COBRANZA];
      }
      
      return [type];
    });
  }, []);

  const validarFormulario = useCallback(() => {
    if ((!selectedCliente && !gestionTypes.includes(GestionTypes.NUEVO_CLIENTE)) || gestionTypes.length === 0) {
      Alert.alert("Debes seleccionar un cliente o marcar 'Nuevo Cliente'.");
      return false;
    }

    if (gestionTypes.includes(GestionTypes.VENTA) && !tipoGestionVenta) {
      Alert.alert("Debes seleccionar el estado de la gestión de Venta.");
      return false;
    }

    if (gestionTypes.includes(GestionTypes.VENTA) && !descripcionVenta.trim()) {
      Alert.alert("Debes ingresar la descripción de la Venta.");
      return false;
    }

    if (gestionTypes.includes(GestionTypes.COBRANZA) && !tipoGestionCobranza) {
      Alert.alert("Debes seleccionar el estado de la gestión de Cobranza.");
      return false;
    }

    return true;
  }, [selectedCliente, gestionTypes, tipoGestionVenta, descripcionVenta, tipoGestionCobranza]);

  const handleAddGestion = useCallback(async () => {
    if (!validarFormulario()) return;

    setIsSubmitting(true);

    try {
      // Mostrar mensaje de carga de ubicación
      showMessage({
        message: "Obteniendo ubicación...",
        type: "info",
        icon: "info",
        duration: 4000,
        backgroundColor: Colors.PRIMARY,
      });

      const location = await obtenerUbicacion();

      // Ocultar el mensaje de ubicación (si usas react-native-flash-message, se oculta solo al pasar el tiempo)
      // Si quieres ocultarlo manualmente, puedes usar hideMessage() aquí

      if (!location) {
        setIsSubmitting(false);
        return;
      }

      const clienteObj = clientes.find(c => c.co_cli === selectedCliente);

      const nuevaGestion = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        cliente: clienteObj ? clienteObj.cli_des : nuevoNombreFarmacia,
        co_cli: selectedCliente,
        tipos: [...gestionTypes],
        venta: gestionTypes.includes(GestionTypes.VENTA) ? {
          tipoGestion: tipoGestionVenta,
          descripcion: descripcionVenta,
        } : undefined,
        cobranza: gestionTypes.includes(GestionTypes.COBRANZA) ? {
          tipoGestion: tipoGestionCobranza,
          descripcion: descripcionCobranza,
        } : undefined,
        nuevo_cliente: gestionTypes.includes(GestionTypes.NUEVO_CLIENTE) ? {
          nombreFarmacia: nuevoNombreFarmacia,
          responsable: nuevoResponsable,
          telefono: nuevoTelefono,
          codigoSim: nuevoCodigoSim,
        } : undefined,
        fecha: new Date().toISOString(),
        ubicacion: location ? {
          lat: location.coords.latitude,
          lng: location.coords.longitude,
          accuracy: location.coords.accuracy,
        } : null,
      };

      await addGestion(nuevaGestion);

      showMessage({
        message: "Gestión guardada con éxito de manera local.",
        type: "success",
        icon: "success",
        duration: 2500,
        backgroundColor: Colors.SECONDARY,
      });

      limpiarFormulario();
      setShowGestionForm(false);
    } catch (error) {
      Alert.alert("Error", "No se pudo guardar la gestión. Intenta nuevamente.");
    } finally {
      setIsSubmitting(false);
    }
  }, [
    validarFormulario, clientes, selectedCliente, gestionTypes,
    tipoGestionVenta, descripcionVenta, tipoGestionCobranza,
    descripcionCobranza, nuevoNombreFarmacia, nuevoResponsable,
    nuevoTelefono, nuevoCodigoSim, addGestion, limpiarFormulario
  ]);

  const handleUploadGestiones = useCallback(async () => {
    if (gestiones.length === 0) {
      Alert.alert("No hay gestiones para cargar.");
      return;
    }

    // Filtrar solo gestiones no enviadas
    const gestionesPendientes = gestiones.filter(g => !g.enviada);
    
    if (gestionesPendientes.length === 0) {
      Alert.alert("Todas las gestiones ya han sido enviadas.");
      return;
    }

    try {
      const userData = await AsyncStorage.getItem(StorageKeys.USER_DATA);
      let usuario = userData ? JSON.parse(userData) : null;

      const payload = { usuario, gestiones: gestionesPendientes };

      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        if (data && typeof data.insertadas === "number" && typeof data.omitidas === "number") {
          // Marcar gestiones como enviadas
          const gestionesActualizadas = gestiones.map(g => 
            gestionesPendientes.some(p => p.id === g.id) ? { ...g, enviada: true } : g
          );
          await AsyncStorage.setItem(StorageKeys.GESTIONES, JSON.stringify(gestionesActualizadas));
          await loadGestiones(); // <-- Agrega esta línea para refrescar el estado

          let mensaje = "";
          if (data.insertadas > 0 && data.omitidas === 0) {
            mensaje = `¡${data.insertadas} gestiones insertadas exitosamente!`;
          } else if (data.insertadas > 0 && data.omitidas > 0) {
            mensaje = `¡${data.insertadas} gestiones nuevas insertadas!\n${data.omitidas} gestiones omitidas por estar repetidas.`;
          } else if (data.insertadas === 0 && data.omitidas > 0) {
            mensaje = `Todas las gestiones fueron omitidas (${data.omitidas}) porque ya existen en la base de datos.`;
          } else {
            mensaje = "No se procesaron gestiones.";
          }
          
          Alert.alert("Gestiones cargadas", mensaje, [{ text: "OK", style: "default" }]);
        } else {
          Alert.alert("Error", "No se pudo cargar la información.");
        }
      } else {
        Alert.alert("Error", "No se pudo conectar con el servidor.");
      }
    } catch (error) {
      console.error("Error al subir gestiones:", error); // <-- Agrega este log
      Alert.alert("Error", "Ocurrió un error al intentar cargar las gestiones.");
    }
  }, [gestiones]);

  const handleDeleteGestionesEnviadas = useCallback(async () => {
    try {
      await deleteGestionesEnviadas();
      Alert.alert("Registros enviados borrados.");
    } catch (error) {
      Alert.alert("Error", "No se pudieron borrar los registros enviados.");
    }
  }, [deleteGestionesEnviadas]);

  const renderGestionItem = useCallback(({ item }) => {
    const tipoGestionColor = (tipo) => {
      if (tipo === "en_proceso") return Colors.DARK_YELLOW;
      return RADIO_TIPO_GESTION.find(opt => opt.value === tipo)?.color || Colors.TEXT;
    };

    const tipoGestionLabel = (tipo) => {
      return RADIO_TIPO_GESTION.find(opt => opt.value === tipo)?.label || tipo;
    };

    return (
      <TouchableOpacity
        onPress={() => {
          setGestionSeleccionada(item);
          setShowDetalleModal(true);
        }}
        activeOpacity={0.8}
        accessibilityLabel={`Ver detalles de gestión para ${item.cliente}`}
      >
        <View
          style={[
            styles.gestionItem,
            item.enviada
              ? { borderColor: Colors.SECONDARY, backgroundColor: "#e9f7ef" } // <-- Fondo verde claro y borde verde
              : { borderColor: Colors.ERROR, backgroundColor: Colors.WHITE },
          ]}
        >
          <Text style={styles.gestionCliente}>{item.cliente}</Text>
          
          {item.tipos && item.tipos.length > 0 && (
            <Text style={styles.gestionInfo}>
              <Text style={{ fontWeight: "bold" }}>Tipo(s): </Text>
              {item.tipos.map((tipo, idx) => {
                let label = "";
                if (tipo === GestionTypes.VENTA) label = "Venta";
                if (tipo === GestionTypes.COBRANZA) label = "Cobranza";
                if (tipo === GestionTypes.NUEVO_CLIENTE) label = "Nuevo Cliente";
                return (
                  <Text
                    key={tipo}
                    style={{ fontWeight: "bold", color: Colors.PRIMARY }}
                  >
                    {label}
                    {idx < item.tipos.length - 1 ? ", " : ""}
                  </Text>
                );
              })}
            </Text>
          )}
          
          {item.venta && (
            <>
              <Text style={styles.gestionInfo}>
                <Text style={{ fontWeight: "bold" }}>Gestión Venta: </Text>
                <Text style={{
                  fontWeight: "bold",
                  color: tipoGestionColor(item.venta.tipoGestion),
                }}>
                  {tipoGestionLabel(item.venta.tipoGestion)}
                </Text>
              </Text>
              <Text style={styles.gestionDesc}>{item.venta.descripcion}</Text>
            </>
          )}
          
          {item.cobranza && (
            <>
              <Text style={styles.gestionInfo}>
                <Text style={{ fontWeight: "bold" }}>Gestión Cobranza: </Text>
                <Text style={{
                  fontWeight: "bold",
                  color: tipoGestionColor(item.cobranza.tipoGestion),
                }}>
                  {tipoGestionLabel(item.cobranza.tipoGestion)}
                </Text>
              </Text>
              <Text style={styles.gestionDesc}>{item.cobranza.descripcion}</Text>
            </>
          )}
          
          {item.nuevo_cliente && (
            <>
              <Text style={styles.gestionInfo}>
                <Text style={{ fontWeight: "bold" }}>Nuevo Cliente</Text>
              </Text>
              <Text style={styles.gestionDesc}>
                <Text style={{ fontWeight: "bold" }}>Responsable: </Text>
                {item.nuevo_cliente.responsable}
                {"\n"}
                <Text style={{ fontWeight: "bold" }}>Teléfono: </Text>
                {item.nuevo_cliente.telefono}
                {"\n"}
                <Text style={{ fontWeight: "bold" }}>Código SIM: </Text>
                {item.nuevo_cliente.codigoSim}
              </Text>
            </>
          )}
          
          <Text style={styles.gestionFecha}>{new Date(item.fecha).toLocaleString()}</Text>
          
          {!item.enviada && (
            <ActionButton
              onPress={() => deleteGestion(item.id)}
              text="Borrar gestión local"
              backgroundColor={Colors.ERROR}
            />
          )}
        </View>
      </TouchableOpacity>
    );
  }, [deleteGestion]);

  const renderClienteItem = useCallback(({ item }) => (
    <TouchableOpacity
      style={[
        styles.clienteItem,
        selectedCliente === item.co_cli && styles.clienteItemSelected,
      ]}
      onPress={() => {
        setSelectedCliente(item.co_cli);
        setSearch("");
      }}
      accessibilityLabel={`Seleccionar cliente ${item.cli_des}`}
    >
      <Text style={styles.clienteText}>
        {item.cli_des}{" "}
        <Text style={{ color: Colors.WARNING, fontWeight: "bold" }}>
          ({item.co_cli})
        </Text>
      </Text>
    </TouchableOpacity>
  ), [selectedCliente]);

  const clienteSeleccionado = useMemo(() => 
    clientes.find(c => c.co_cli === selectedCliente),
    [clientes, selectedCliente]
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={gestiones}
        keyExtractor={item => item.id}
        style={styles.gestionesList}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListHeaderComponent={
          <View style={styles.headerSticky}>
            <Text style={styles.floatingTitle}>Gestión de Visitas</Text>
            <Text style={styles.floatingSubtitle}>Gestiones realizadas</Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={{ color: Colors.LIGHT_TEXT, padding: 10 }}>
            No hay gestiones registradas
          </Text>
        }
        renderItem={renderGestionItem}
        initialNumToRender={10}
        maxToRenderPerBatch={5}
        windowSize={5}
      />

      <View style={styles.fabRow}>
        <TouchableOpacity
          style={[styles.roundButton, { backgroundColor: Colors.PRIMARY }]}
          onPress={() => setShowGestionForm(true)}
          activeOpacity={0.8}
          accessibilityLabel="Añadir nueva gestión"
        >
          <Ionicons name="add" size={28} color={Colors.WHITE} />
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.roundButton, { backgroundColor: Colors.SECONDARY }]}
          onPress={handleUploadGestiones}
          accessibilityLabel="Subir gestiones al servidor"
        >
          <Ionicons name="cloud-upload-outline" size={24} color={Colors.WHITE} />
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.roundButton, { backgroundColor: "#d9534f" }]}
          onPress={handleDeleteGestionesEnviadas}
          activeOpacity={0.8}
          accessibilityLabel="Eliminar gestiones enviadas"
        >
          <Ionicons name="trash-outline" size={24} color={Colors.WHITE} />
        </TouchableOpacity>
      </View>

      <Modal
        visible={showGestionForm}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowGestionForm(false)}
        statusBarTranslucent={true}
      >
        <View style={styles.modalOverlay}>
          {/* KeyboardAvoidingView como contenedor principal */}
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ width: "100%", flex: 1, justifyContent: "center" }}
            keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
          >
            <View style={[styles.modalContent, { maxHeight: "90%" }]}>
              <Text style={styles.title}>Nueva Gestión</Text>
              
              <Text style={styles.label}>Buscar cliente</Text>
              <TextInput
                style={styles.input}
                placeholder="Escriba para buscar..."
                value={search}
                onChangeText={setSearch}
                placeholderTextColor={Colors.LIGHT_TEXT}
                editable={!selectedCliente && !gestionTypes.includes(GestionTypes.NUEVO_CLIENTE)}
                accessibilityLabel="Buscar cliente"
                returnKeyType="done"
              />
              
              {search.length > 0 && !gestionTypes.includes(GestionTypes.NUEVO_CLIENTE) && (
                <View style={styles.pickerWrapper}>
                  {loading ? (
                    <ActivityIndicator size="small" color={Colors.SECONDARY} />
                  ) : (
                    <FlatList
                      data={filteredClientes}
                      keyExtractor={item => item.co_cli}
                      style={{ maxHeight: 150 }}
                      keyboardShouldPersistTaps="handled"
                      renderItem={renderClienteItem}
                      ListEmptyComponent={
                        <Text style={{ color: Colors.LIGHT_TEXT, padding: 10 }}>
                          No hay clientes
                        </Text>
                      }
                      initialNumToRender={5}
                    />
                  )}
                </View>
              )}
              
              {/* ScrollView con flexGrow para evitar saltos */}
              <ScrollView
                contentContainerStyle={{ paddingBottom: 24, flexGrow: 1, minHeight: 350 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {selectedCliente && (
                  <Text style={styles.selectedClienteLabel}>
                    Cliente seleccionado:{" "}
                    <Text style={{ fontWeight: "bold" }}>
                      {clienteSeleccionado?.cli_des}
                    </Text>
                  </Text>
                )}

                <Text style={styles.label}>Tipo de gestión</Text>
                <View style={styles.radioGroup}>
                  {RADIO_OPTIONS.map(opt => (
                    <RadioButton
                      key={opt.value}
                      label={opt.label}
                      value={opt.value}
                      selected={gestionTypes.includes(opt.value)}
                      onSelect={() => handleToggleGestionType(opt.value)}
                    />
                  ))}
                </View>

                {gestionTypes.includes(GestionTypes.NUEVO_CLIENTE) && (
                  <>
                    <InputWithIcon
                      iconName="business-outline"
                      placeholder="Nombre de la farmacia"
                      value={nuevoNombreFarmacia}
                      onChangeText={setNuevoNombreFarmacia}
                      accessibilityLabel="Nombre de la farmacia"
                    />
                    
                    <InputWithIcon
                      iconName="person-outline"
                      placeholder="Responsable"
                      value={nuevoResponsable}
                      onChangeText={setNuevoResponsable}
                      accessibilityLabel="Responsable de la farmacia"
                    />
                    
                    <InputWithIcon
                      iconName="call-outline"
                      placeholder="Número de teléfono"
                      value={nuevoTelefono}
                      onChangeText={setNuevoTelefono}
                      keyboardType="phone-pad"
                      accessibilityLabel="Número de teléfono"
                    />
                    
                    <InputWithIcon
                      iconName="barcode-outline"
                      placeholder="Código SIM"
                      value={nuevoCodigoSim}
                      onChangeText={setNuevoCodigoSim}
                      accessibilityLabel="Código SIM"
                    />
                    
                    {gestionTypes.includes(GestionTypes.VENTA) && (
                      <>
                        <Text style={styles.label}>Estado de la gestión (Venta)</Text>
                        <View style={styles.radioGroup}>
                          {RADIO_TIPO_GESTION.map(opt => (
                            <RadioButton
                              key={"venta_" + opt.value}
                              label={opt.label}
                              value={opt.value}
                              selected={tipoGestionVenta === opt.value}
                              onSelect={() => setTipoGestionVenta(opt.value)}
                              color={opt.color}
                            />
                          ))}
                        </View>
                        <TextInput
                          style={[styles.input, styles.inputMultiline]}
                          placeholder="Descripción Venta"
                          value={descripcionVenta}
                          onChangeText={setDescripcionVenta}
                          multiline
                          placeholderTextColor={Colors.LIGHT_TEXT}
                          accessibilityLabel="Descripción de venta"
                        />
                      </>
                    )}
                  </>
                )}

                {!gestionTypes.includes(GestionTypes.NUEVO_CLIENTE) && (
                  <>
                    {gestionTypes.includes(GestionTypes.VENTA) && (
                      <>
                        <Text style={styles.label}>Estado de la gestión (Venta)</Text>
                        <View style={styles.radioGroup}>
                          {RADIO_TIPO_GESTION.map(opt => (
                            <RadioButton
                              key={"venta_" + opt.value}
                              label={opt.label}
                              value={opt.value}
                              selected={tipoGestionVenta === opt.value}
                              onSelect={() => setTipoGestionVenta(opt.value)}
                              color={opt.color}
                            />
                          ))}
                        </View>
                        <TextInput
                          style={[styles.input, styles.inputMultiline]}
                          placeholder="Descripción Venta"
                          value={descripcionVenta}
                          onChangeText={setDescripcionVenta}
                          multiline
                          placeholderTextColor={Colors.LIGHT_TEXT}
                          accessibilityLabel="Descripción de venta"
                        />
                      </>
                    )}
                    
                    {gestionTypes.includes(GestionTypes.COBRANZA) && (
                      <>
                        <Text style={styles.label}>Estado de la gestión (Cobranza)</Text>
                        <View style={styles.radioGroup}>
                          {RADIO_TIPO_GESTION.map(opt => (
                            <RadioButton
                              key={"cobranza_" + opt.value}
                              label={opt.label}
                              value={opt.value}
                              selected={tipoGestionCobranza === opt.value}
                              onSelect={() => setTipoGestionCobranza(opt.value)}
                              color={opt.color}
                            />
                          ))}
                        </View>
                        <TextInput
                          style={[styles.input, styles.inputMultiline]}
                          placeholder="Descripción Cobranza"
                          value={descripcionCobranza}
                          onChangeText={setDescripcionCobranza}
                          multiline
                          placeholderTextColor={Colors.LIGHT_TEXT}
                          accessibilityLabel="Descripción de cobranza"
                        />
                      </>
                    )}
                  </>
                )}

                <View style={styles.formButtonsRow}>
                  <ActionButton
                    onPress={handleAddGestion}
                    text={isSubmitting ? "Guardando..." : "Guardar gestión"}
                    backgroundColor={Colors.PRIMARY}
                    disabled={isSubmitting}
                  />
                  
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => {
                      limpiarFormulario();
                      setShowGestionForm(false);
                    }}
                    disabled={isSubmitting}
                  >
                    <Text style={styles.cancelButtonText}>Cancelar</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal
        visible={showDetalleModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowDetalleModal(false)}
        statusBarTranslucent={true}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: "#f7f9fa", borderColor: Colors.SECONDARY, borderWidth: 2 }]}>
            <Text style={[styles.title, { color: Colors.SECONDARY, marginBottom: 12 }]}>Detalle de Gestión</Text>
            
            {gestionSeleccionada && (
              <ScrollView>
                <Text style={[styles.label, { color: Colors.PRIMARY }]}>
                  Cliente: <Text style={{ color: Colors.TEXT, fontWeight: "bold" }}>{gestionSeleccionada.cliente}</Text>
                </Text>
                
                <Text style={[styles.label, { color: Colors.PRIMARY }]}>
                  Fecha: <Text style={{ color: Colors.TEXT }}>{new Date(gestionSeleccionada.fecha).toLocaleString()}</Text>
                </Text>
                
                <Text style={[styles.label, { color: Colors.PRIMARY }]}>
                  Tipos: <Text style={{ color: Colors.TEXT }}>{gestionSeleccionada.tipos?.join(", ")}</Text>
                </Text>
                
                {gestionSeleccionada.venta && (
                  <>
                    <Text style={[styles.label, { color: Colors.SECONDARY }]}>
                      Venta: <Text style={{ color: Colors.TEXT }}>{gestionSeleccionada.venta.tipoGestion}</Text>
                    </Text>
                    <Text style={[styles.label, { color: Colors.SECONDARY }]}>
                      Descripción Venta: <Text style={{ color: Colors.TEXT }}>{gestionSeleccionada.venta.descripcion}</Text>
                    </Text>
                  </>
                )}
                
                {gestionSeleccionada.cobranza && (
                  <>
                    <Text style={[styles.label, { color: Colors.WARNING }]}>
                      Cobranza: <Text style={{ color: Colors.TEXT }}>{gestionSeleccionada.cobranza.tipoGestion}</Text>
                    </Text>
                    <Text style={[styles.label, { color: Colors.WARNING }]}>
                      Descripción Cobranza: <Text style={{ color: Colors.TEXT }}>{gestionSeleccionada.cobranza.descripcion}</Text>
                    </Text>
                  </>
                )}
                
                {gestionSeleccionada.nuevo_cliente && (
                  <>
                    <Text style={[styles.label, { color: Colors.PRIMARY }]}>
                      Nuevo Cliente: <Text style={{ color: Colors.TEXT }}>{gestionSeleccionada.nuevo_cliente.nombreFarmacia}</Text>
                    </Text>
                    <Text style={[styles.label, { color: Colors.PRIMARY }]}>
                      Responsable: <Text style={{ color: Colors.TEXT }}>{gestionSeleccionada.nuevo_cliente.responsable}</Text>
                    </Text>
                    <Text style={[styles.label, { color: Colors.PRIMARY }]}>
                      Teléfono: <Text style={{ color: Colors.TEXT }}>{gestionSeleccionada.nuevo_cliente.telefono}</Text>
                    </Text>
                    <Text style={[styles.label, { color: Colors.PRIMARY }]}>
                      Código SIM: <Text style={{ color: Colors.TEXT }}>{gestionSeleccionada.nuevo_cliente.codigoSim}</Text>
                    </Text>
                  </>
                )}
                
                {gestionSeleccionada.ubicacion && (
                  <>
                    <Text style={[styles.label, { color: Colors.LIGHT_TEXT }]}>Ubicación:</Text>
                    <Text style={{ color: Colors.TEXT }}>Latitud: {gestionSeleccionada.ubicacion.lat.toFixed(6)}</Text>
                    <Text style={{ color: Colors.TEXT }}>Longitud: {gestionSeleccionada.ubicacion.lng.toFixed(6)}</Text>
                    <Text style={{ color: Colors.TEXT }}>Precisión: {gestionSeleccionada.ubicacion.accuracy.toFixed(2)} metros</Text>
                  </>
                )}
              </ScrollView>
            )}
            
            <TouchableOpacity
              style={styles.detalleCloseButton}
              onPress={() => setShowDetalleModal(false)}
            >
              <Text style={styles.detalleCloseButtonText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ===== ESTILOS =====
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.BACKGROUND,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: Colors.TEXT,
    marginBottom: 10,
    textAlign: "center",
    letterSpacing: 1,
  },
  label: {
    fontWeight: "600",
    color: Colors.PRIMARY,
    marginTop: 12,
    marginBottom: 4,
    fontSize: 15,
  },
  gestionesList: {
    flex: 1,
  },
  gestionItem: {
    backgroundColor: Colors.WHITE,
    borderRadius: 10,
    padding: 12,
    marginHorizontal: 18,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.PRIMARY,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  gestionCliente: {
    fontWeight: "bold",
    color: Colors.TEXT,
    fontSize: 16,
  },
  gestionInfo: {
    color: Colors.PRIMARY,
    fontSize: 14,
    marginTop: 2,
  },
  gestionDesc: {
    color: Colors.TEXT,
    fontSize: 14,
    marginTop: 2,
  },
  gestionFecha: {
    color: Colors.TEXT,
    fontSize: 15,
    marginTop: 2,
    textAlign: "right",
  },
  fabRow: {
    position: "absolute",
    bottom: 20,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    zIndex: 20,
  },
  roundButton: {
    width: 45,
    height: 45,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 16,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.PRIMARY,
    borderRadius: 8,
    padding: 10,
    backgroundColor: Colors.WHITE,
    fontSize: 15,
    color: Colors.TEXT,
    marginBottom: 10, // <-- Añade margen inferior para separar los inputs
  },
  inputMultiline: {
    minHeight: 80, // <-- Aumenta la altura mínima para inputs multilinea
    textAlignVertical: "top",
  },
  clienteItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  clienteItemSelected: {
    backgroundColor: Colors.PRIMARY,
  },
  clienteText: {
    fontSize: 15,
    color: Colors.TEXT,
  },
  selectedClienteLabel: {
    color: Colors.SECONDARY,
    marginBottom: 8,
    marginTop: 8,
    fontSize: 15,
  },
  radioGroup: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 10,
    marginBottom: 18,
  },
  radioOption: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 18,
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: Colors.PRIMARY,
    marginRight: 7,
    backgroundColor: Colors.WHITE,
  },
  radioCircleSelected: {
    backgroundColor: Colors.SECONDARY,
    borderColor: Colors.SECONDARY,
  },
  radioLabel: {
    fontSize: 15,
    color: Colors.TEXT,
  },
  formButtonsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
    gap: 8,
  },
  actionButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    elevation: 2,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  actionButtonText: {
    color: Colors.WHITE,
    fontWeight: "bold",
    fontSize: 15,
  },
  cancelButton: {
    backgroundColor: "#bdbdbd",
    padding: 12,
    borderRadius: 8,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButtonText: {
    color: Colors.TEXT,
    fontWeight: "bold",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalContent: {
    width: "100%",
    maxHeight: "100%", // <-- Cambia de "90%" a "100%" para mejor adaptación con el teclado
    backgroundColor: Colors.WHITE,
    borderRadius: 14,
    padding: 18,
    elevation: 8,
  },
  inputIconRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  inputIcon: {
    marginRight: 8,
  },
  floatingTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: Colors.TEXT,
    textAlign: "center",
    letterSpacing: 1,
    backgroundColor: Colors.BACKGROUND,
    paddingVertical: 8,
  },
  floatingSubtitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.PRIMARY,
    textAlign: "center",
    backgroundColor: Colors.BACKGROUND,
    paddingVertical: 4,
  },
  headerSticky: {
    backgroundColor: Colors.BACKGROUND,
    paddingTop: 18,
    paddingBottom: 8,
    zIndex: 10,
  },
  detalleCloseButton: {
    backgroundColor: Colors.PRIMARY,
    marginTop: 24,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignSelf: "center",
    elevation: 4,
    borderWidth: 2,
    borderColor: Colors.SECONDARY,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
  },
  detalleCloseButtonText: {
    color: Colors.WHITE,
    fontWeight: "bold",
    fontSize: 18,
    letterSpacing: 1,
  },
  pickerWrapper: {
    borderWidth: 1,
    borderColor: Colors.PRIMARY,
    borderRadius: 8,
    marginBottom: 10,
    backgroundColor: Colors.WHITE,
    overflow: "hidden",
    minHeight: 44,
    justifyContent: "center",
  },
});