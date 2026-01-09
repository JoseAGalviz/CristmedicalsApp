import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function HomeScreenConductor() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const loadUser = async () => {
      const data = await AsyncStorage.getItem('userData');
      if (data) setUser(JSON.parse(data));
    };
    loadUser();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Aplicación de Guías de Carga</Text>
      {user ? (
        <View style={styles.card}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user.nombre ? user.nombre.charAt(0).toUpperCase() : "?"}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Nombre:</Text>
            <Text style={styles.value}>{user.nombre}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Rol:</Text>
            <Text style={styles.value}>{user.rol}</Text>
          </View>
        </View>
      ) : (
        <Text style={styles.loading}>Cargando datos del usuario...</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    backgroundColor: '#eaf6fb' 
  },
  title: { 
    fontSize: 24, 
    fontWeight: 'bold', 
    color: '#000000ff', 
    marginBottom: 32, 
    letterSpacing: 1 
  },
  card: { 
    backgroundColor: '#fff', 
    borderRadius: 18, 
    padding: 32, 
    elevation: 6, 
    shadowColor: '#1A9888', 
    shadowOpacity: 0.15, 
    shadowRadius: 10, 
    shadowOffset: { width: 0, height: 4 },
    width: 340,
    alignItems: 'center'
  },
  avatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#1A9888',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
    elevation: 3,
  },
  avatarText: {
    color: '#fff',
    fontSize: 34,
    fontWeight: 'bold',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
    width: '100%',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  label: { 
    fontWeight: 'bold', 
    color: '#1A9888', 
    fontSize: 17 
  },
  value: { 
    color: '#333', 
    fontSize: 17, 
    fontWeight: '600' 
  },
  loading: {
    color: '#888',
    fontSize: 16,
  },
});