import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, Alert, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

export default function UserDataScreen({ navigation }) {
    const [userData, setUserData] = useState(null);
    const [segmentDescriptions, setSegmentDescriptions] = useState([]);

    useEffect(() => {
        const loadUserDataAndSegments = async () => {
            try {
                // Cargar datos del usuario desde AsyncStorage
                const data = await AsyncStorage.getItem('userData');
                if (data) {
                    const parsedData = JSON.parse(data);
                    setUserData(parsedData);

                    // Si el usuario tiene segmentos, cargar sus descripciones
                    if (parsedData.segmentos && parsedData.segmentos.length > 0) {
                        await fetchSegmentDescriptions(parsedData.segmentos);
                    }
                }
            } catch (e) {
                Alert.alert('Error', 'No se pudieron cargar los datos del usuario o los segmentos.');
                console.error("Error loading data:", e);
            }
        };

        const fetchSegmentDescriptions = async (userSegmentCodes) => {
            try {
                const response = await fetch('https://98.94.185.164.nip.io/api/clientes/segmentos');
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const allSegments = await response.json();

                // Filtrar los segmentos que coinciden con los del usuario y obtener sus descripciones
                const descriptions = allSegments
                    .filter(segment => userSegmentCodes.includes(segment.co_seg))
                    .map(segment => `${segment.co_seg} - ${segment.seg_des}`);

                setSegmentDescriptions(descriptions);
            } catch (e) {
                Alert.alert('Error', 'No se pudieron cargar las descripciones de los segmentos.');
                console.error("Error fetching segments:", e);
            }
        };

        loadUserDataAndSegments();
    }, []);

    if (!userData) {
        return (
            <View style={styles.container}>
                <Text style={styles.title}>Cargando datos del usuario...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.navigate('HomeTabs')}>
                <Ionicons name="arrow-back" size={28} color="#49AF4E" />
                <Text style={styles.backText}>Volver al inicio</Text>
            </TouchableOpacity>
            <View style={styles.card}>
                <Image
                    source={require('../../assets/logo.png')}
                    style={styles.logo}
                    resizeMode="contain"
                />
                <Text style={styles.title}>Datos del Usuario</Text>
                <View style={styles.infoRow}>
                    <Text style={styles.label}>Nombre:</Text>
                    <Text style={styles.value}>{userData.nombre}</Text>
                </View>
                <View style={styles.infoRow}>
                    <Text style={styles.label}>Usuario:</Text>
                    <Text style={styles.value}>{userData.usuario}</Text>
                </View>
                <View style={styles.infoRow}>
                    <Text style={styles.label}>Rol:</Text>
                    <Text style={styles.value}>{userData.rol}</Text>
                </View>
                <View style={styles.infoRow}>
                    <Text style={styles.label}>Fecha de registro:</Text>
                    <Text style={styles.value}>{new Date(userData.fecha_registro).toLocaleDateString()}</Text>
                </View>
                <View style={[styles.infoRow, { flexDirection: 'column', alignItems: 'flex-start', borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 }]}>
                    <Text style={[styles.label, { marginBottom: 6 }]}>Segmentos:</Text>
                    {segmentDescriptions.length > 0 ? (
                        <View style={styles.segmentList}>
                            {segmentDescriptions.map((desc, idx) => (
                                <Text key={idx} style={styles.segmentItem}>
                                    {desc}
                                </Text>
                            ))}
                        </View>
                    ) : (
                        <Text style={styles.value}>N/A</Text>
                    )}
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#e9f5ee',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    backButton: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        marginBottom: 18,
        marginLeft: 5,
        marginTop: 10,
    },
    backText: {
        color: '#49AF4E',
        fontSize: 17,
        marginLeft: 6,
        fontWeight: 'bold',
    },
    card: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: '#fff',
        borderRadius: 18,
        paddingVertical: 32,
        paddingHorizontal: 28,
        shadowColor: '#49AF4E',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.13,
        shadowRadius: 10,
        elevation: 7,
        alignItems: 'center',
    },
    logo: {
        width: 220,
        height: 115,
        marginBottom: 5,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#49AF4E',
        marginBottom: 24,
        letterSpacing: 1,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        marginBottom: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
        paddingBottom: 6,
    },
    label: {
        fontWeight: 'bold',
        color: '#1A9888',
        fontSize: 16,
        width: 120,
    },
    value: {
        color: '#222',
        fontSize: 16,
        flex: 1,
        textAlign: 'right',
    },
    segmentList: {
        width: '100%',
        paddingLeft: 8,
        marginBottom: 6,
    },
    segmentItem: {
        color: '#333',
        fontSize: 15,
        marginBottom: 2.5,
        textAlign: 'right',
    },
});