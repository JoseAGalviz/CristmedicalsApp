import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { DrawerContentScrollView, DrawerItemList, DrawerItem } from '@react-navigation/drawer';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function CustomDrawerContent(props) {
    const [user, setUser] = useState(null);
    const navigation = useNavigation();

    useEffect(() => {
        const loadUser = async () => {
            const data = await AsyncStorage.getItem('userData');
            if (data) setUser(JSON.parse(data));
        };
        loadUser();
    }, []);

    const handleLogout = async () => {
        await AsyncStorage.removeItem('userData');
        navigation.replace('Login');
    };

    return (
        <DrawerContentScrollView {...props}>
            <View style={styles.header}>
                <Image
                    source={require('../../assets/logo.png')}
                    style={styles.profilePic}
                />
                <Text style={styles.userName}>
                    {user ? user.nombre : 'Usuario'}
                </Text>
                <Text style={styles.userEmail}>
                    {user ? user.usuario : ''}
                </Text>
            </View>

            <DrawerItemList {...props} />

            <DrawerItem
                label="Cerrar Sesión"
                onPress={handleLogout}
                icon={({ color, size }) => (
                    <Ionicons name="log-out-outline" color="#fff" size={size} />
                )}
                style={[styles.logoutButton, { backgroundColor: '#1A9888', borderTopWidth: 0 }]}
                labelStyle={[styles.logoutButtonText, { color: '#fff', fontWeight: 'bold', fontSize: 16, textAlign: 'center'}]}
            />
        </DrawerContentScrollView>
    );
}

const styles = StyleSheet.create({
    header: {
        padding: 20,
        backgroundColor: '#f2f2f2',
        borderBottomWidth: 1,
        borderBottomColor: '#ccc',
        alignItems: 'center',
        marginBottom: 10,
    },
    profilePic: {
        width: 100,
        height: 100,
        borderRadius: 30,
        marginBottom: 10,
        padding: 5,
        borderColor: '#ddd',
        resizeMode: 'contain',
    },
    userName: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
    },
    userEmail: {
        fontSize: 14,
        color: '#666',
        marginTop: 5,
    },
    logoutButton: {
        marginTop: 20,
        borderRadius: 8,
        paddingTop: 10,
    },
    logoutButtonText: {
        color: '#fff',
        fontWeight: 'bold',
    },
});