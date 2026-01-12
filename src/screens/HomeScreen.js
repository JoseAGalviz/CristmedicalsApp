import React, { useLayoutEffect, useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, SafeAreaView, Dimensions, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncAllData } from '../services/syncAllData'; // Importa la función correctamente
import FlashMessage, { showMessage } from "react-native-flash-message";
import { useAuth } from '../context/AuthContext';

// Constantes para evitar "magic strings"
const STORAGE_KEYS = {
  // USER_DATA: 'userData', // Ya no se necesita leer manualmente
  TOTALES: 'totales',
  CLIENTES: 'clientes'
};

const COLORS = {
  PRIMARY: '#1A9888',
  SECONDARY: '#49AF4E',
  BACKGROUND: '#F8FAFC',
  ERROR: '#d84315',
  WHITE: '#FFFFFF',
  LIGHT_BACKGROUND: '#E3F6F2',
  TEXT: '#333333',
  LIGHT_TEXT: '#999999'
};

const MESSAGES = {
  SYNC_SUCCESS: "¡Sincronización exitosa!",
  SYNC_ERROR: "Error al sincronizar",
  NO_DATA: "No se pudo obtener el resultado."
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function HomeScreen({ navigation }) {
  const { user } = useAuth();
  const [totalClientes, setTotalClientes] = useState(0);
  const [endpointResult, setEndpointResult] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [clientesState, setClientesState] = useState([]);

  // loadUser effect ELIMINADO - Usamos contexto

  // Obtener totales desde AsyncStorage
  const obtenerTotales = useCallback(async () => {
    try {
      const totalesStr = await AsyncStorage.getItem(STORAGE_KEYS.TOTALES);

      if (!totalesStr) {
        setDefaultValues();
        return;
      }

      const data = JSON.parse(totalesStr);
      setTotalClientes(data.total_clientes || 0);
      setEndpointResult(data);
    } catch (error) {
      console.error('Error loading totals:', error);
      setDefaultValues();
    }
  }, []);

  // Establecer valores por defecto
  const setDefaultValues = useCallback(() => {
    setTotalClientes(0);
    setEndpointResult({ error: MESSAGES.NO_DATA });
  }, []);

  // Cargar clientes desde AsyncStorage
  const cargarClientes = useCallback(async () => {
    try {
      const clientesStr = await AsyncStorage.getItem(STORAGE_KEYS.CLIENTES);
      const clientesArr = clientesStr ? JSON.parse(clientesStr) : [];
      setClientesState(clientesArr);
      setTotalClientes(clientesArr.length);
    } catch (error) {
      console.error('Error loading clients:', error);
      setClientesState([]);
      setTotalClientes(0);
    }
  }, []);

  // Manejar la sincronización de datos
  const handleSync = useCallback(async () => {
    setSyncing(true);

    try {
      const result = await syncAllData();

      if (result.success) {
        showMessage({
          message: MESSAGES.SYNC_SUCCESS,
          type: "success",
          icon: "success",
          duration: 2500,
          backgroundColor: COLORS.SECONDARY,
        });
        await cargarClientes();
      } else {
        showMessage({
          message: MESSAGES.SYNC_ERROR,
          description: result.error,
          type: "danger",
          icon: "danger",
          duration: 3500,
        });
      }
    } catch (error) {
      console.error('Sync error:', error);
      showMessage({
        message: MESSAGES.SYNC_ERROR,
        description: "Error inesperado durante la sincronización",
        type: "danger",
        icon: "danger",
        duration: 3500,
      });
    } finally {
      setSyncing(false);
    }
  }, [cargarClientes]);

  // Abrir link de negociaciones
  const handleOpenNegociaciones = useCallback(async () => {
    if (user && user.co_ven) {
      const url = `http://98.94.185.164:8020/dashboard?ven=${user.co_ven}`;
      try {
        const supported = await Linking.canOpenURL(url);
        if (supported) {
          await Linking.openURL(url);
        } else {
          showMessage({
            message: "No se puede abrir el enlace",
            description: "El formato de la URL no es válido para su navegador.",
            type: "warning",
          });
        }
      } catch (error) {
        console.error('Error opening URL:', error);
        showMessage({
          message: "Error al abrir el enlace",
          description: error.message,
          type: "danger",
        });
      }
    } else {
      showMessage({
        message: "Código de vendedor no encontrado",
        description: "No se encontró el co_ven del usuario.",
        type: "danger",
      });
    }
  }, [user]);

  // Configurar el header de navegación
  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => navigation.openDrawer()}
          style={styles.menuButton}
          accessibilityLabel="Abrir menú"
          accessibilityHint="Despliega el menú de navegación"
        >
          <Ionicons name="menu" size={30} color={COLORS.WHITE} />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  // Efectos para cargar datos al montar el componente
  useEffect(() => {
    obtenerTotales();
    cargarClientes();
  }, [obtenerTotales, cargarClientes]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.subtitle}>Bienvenido, {user ? user.nombre : 'Usuario'}</Text>

        <View style={styles.syncRow}>
          <TouchableOpacity
            style={[styles.syncButton, syncing && styles.syncButtonDisabled]}
            onPress={handleSync}
            disabled={syncing}
            accessibilityLabel="Sincronizar datos"
            accessibilityHint="Sincroniza los datos con el servidor"
          >
            {syncing ? (
              <ActivityIndicator size={20} color={COLORS.WHITE} style={styles.syncIcon} />
            ) : (
              <Ionicons name="refresh" size={20} color={COLORS.WHITE} style={styles.syncIcon} />
            )}
            <Text style={styles.syncButtonText}>
              {syncing ? 'Sincronizando...' : 'Sincronizar datos'}
            </Text>
          </TouchableOpacity>

          <View style={styles.clientesInfoBox} accessibilityLabel="Clientes asignados">
            <Text style={styles.infoTitle}>Clientes asignados</Text>
            <Text style={styles.infoNumber}>{totalClientes}</Text>
            <Text style={styles.infoSubtitle}>Total sincronizados</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.negociacionesButton}
          onPress={handleOpenNegociaciones}
          accessibilityLabel="Ir a Negociaciones"
          accessibilityHint="Abre el dashboard de negociaciones en el navegador"
        >
          <Ionicons name="stats-chart" size={24} color={COLORS.WHITE} style={styles.btnIcon} />
          <Text style={styles.negociacionesButtonText}>Negociaciones</Text>
        </TouchableOpacity>

        {/* Overlay de sincronización */}
        {syncing && (
          <View style={styles.syncingOverlay} accessibilityLabel="Sincronizando datos">
            <ActivityIndicator size={60} color={COLORS.PRIMARY} />
            <Text style={styles.syncingText}>Sincronizando datos...</Text>
          </View>
        )}

        {/* Detalle de sincronización */}
        {endpointResult && !syncing && (
          <View style={styles.syncDetailBox} accessibilityLabel="Detalle de sincronización">
            <Text style={styles.syncDetailTitle}>Detalle de sincronización:</Text>
            <Text style={styles.syncDetailItem}>
              Clientes sincronizados: {clientesState.length}
            </Text>
          </View>
        )}

        <FlashMessage position="top" />
      </View>
    </SafeAreaView>
  );
}

// Estilos adaptados y reorganizados
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: '4%',
    paddingTop: 30,
    width: '100%',
    minHeight: '100%',
  },
  subtitle: {
    fontSize: 22,
    color: COLORS.PRIMARY,
    fontWeight: 'bold',
    marginBottom: 18,
    letterSpacing: 0.5,
    textAlign: 'center',
    width: '100%',
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
    marginTop: 2,
    width: '100%',
    maxWidth: 500,
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.PRIMARY,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    marginRight: 8,
    shadowColor: COLORS.PRIMARY,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
    minWidth: 120,
    maxWidth: SCREEN_WIDTH * 0.45,
  },
  syncButtonDisabled: {
    opacity: 0.7,
  },
  syncButtonText: {
    color: COLORS.WHITE,
    fontWeight: 'bold',
    fontSize: 16,
    letterSpacing: 0.5,
    flexShrink: 1,
  },
  syncIcon: {
    marginRight: 6,
  },
  clientesInfoBox: {
    backgroundColor: COLORS.LIGHT_BACKGROUND,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.PRIMARY,
    minWidth: 100,
    maxWidth: SCREEN_WIDTH * 0.45,
    shadowColor: COLORS.SECONDARY,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  infoTitle: {
    color: COLORS.PRIMARY,
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: 2,
    textAlign: 'center',
    width: '100%',
  },
  infoNumber: {
    color: COLORS.SECONDARY,
    fontWeight: 'bold',
    fontSize: 32,
    marginVertical: 2,
    textAlign: 'center',
    width: '100%',
  },
  infoSubtitle: {
    color: COLORS.TEXT,
    fontSize: 13,
    textAlign: 'center',
    width: '100%',
  },
  menuButton: {
    marginLeft: 15,
  },
  syncingOverlay: {
    position: 'absolute',
    top: '40%',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.7)',
    paddingVertical: 40,
    width: '100%',
  },
  syncingText: {
    marginTop: 16,
    fontSize: 18,
    color: COLORS.PRIMARY,
    fontWeight: 'bold',
    textAlign: 'center',
    width: '100%',
  },
  syncDetailBox: {
    marginTop: 30,
    backgroundColor: COLORS.LIGHT_BACKGROUND,
    borderRadius: 10,
    padding: 18,
    width: '100%',
    maxWidth: 500,
    alignSelf: 'center',
    elevation: 2,
  },
  syncDetailTitle: {
    fontWeight: 'bold',
    color: COLORS.PRIMARY,
    fontSize: 16,
    marginBottom: 8,
    textAlign: 'center',
    width: '100%',
  },
  syncDetailItem: {
    fontSize: 15,
    color: COLORS.TEXT,
    marginBottom: 4,
    textAlign: 'center',
    width: '100%',
  },
  negociacionesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.SECONDARY, // Usamos el verde secundario para diferenciar
    paddingVertical: 15,
    paddingHorizontal: 25,
    borderRadius: 12,
    marginTop: 20,
    width: '100%',
    maxWidth: 500,
    shadowColor: COLORS.SECONDARY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
  },
  negociacionesButtonText: {
    color: COLORS.WHITE,
    fontWeight: 'bold',
    fontSize: 18,
    letterSpacing: 1,
  },
  btnIcon: {
    marginRight: 10,
  },
});