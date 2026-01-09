import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createDrawerNavigator } from "@react-navigation/drawer"; // Importar Drawer Navigator
import FlashMessage from "react-native-flash-message";
import AsyncStorage from "@react-native-async-storage/async-storage";

import LoginScreen from "./src/screens/LoginScreen";
import AppNavigator from './src/navigation/AppNavigator'; // Ajusta la ruta si es necesario
import UserDataScreen from './src/screens/UserDataScreen';
import CustomDrawerContent from './src/navigation/CustomDrawerContent';
import AppNavigatorConductor from './src/navigation/AppNavigatorConductor';

const Stack = createNativeStackNavigator();
const Drawer = createDrawerNavigator(); // Crear una instancia del Drawer Navigator

// Este componente contendrá el Drawer Navigator
function MainAppDrawer() {
  return (
    <Drawer.Navigator
      drawerContent={(props) => <CustomDrawerContent {...props} />} // Usar tu contenido personalizado
      screenOptions={{
        headerShown: false, // Puedes mostrar el header si lo prefieres, pero el Drawer lo manejará
        drawerStyle: {
          backgroundColor: "#ffffff", // Color de fondo del Drawer
          width: 270, // Cambia este valor al ancho que desees (por defecto es 240)
        },
      }}
    >
      {/* La pantalla principal dentro del Drawer es tu AppNavigator (el Tab Navigator) */}
      <Drawer.Screen
        name="HomeTabs"
        component={AppNavigator}
        options={{ title: "Inicio" }}
      />
      {/* La pantalla de datos del usuario accesible desde el Drawer */}
      <Drawer.Screen
        name="UserData"
        component={UserDataScreen}
        options={{ title: "Mi Perfil" }}
      />

      {/* Puedes añadir más pantallas aquí si quieres que aparezcan en el Drawer */}
    </Drawer.Navigator>
  );
}

function MainAppDrawerConductor() {
  return (
    <Drawer.Navigator
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerStyle: { backgroundColor: "#fff", width: 270 },
      }}
    >
      <Drawer.Screen
        name="HomeTabsConductor"
        component={AppNavigatorConductor}
        options={{ title: "Inicio" }}
      />
      {/* ...otras pantallas específicas para conductor */}
    </Drawer.Navigator>
  );
}

import { AuthProvider, useAuth } from './src/context/AuthContext';

function AppLayout() {
  const { user, isSplashLoading } = useAuth();

  if (isSplashLoading) {
    // Puedes mostrar un splash o loader aquí
    return null;
  }

  const isAuthenticated = !!user;
  const userRole = user?.rol;

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={
          isAuthenticated
            ? userRole === "conductor"
              ? "MainAppDrawerConductor"
              : "MainAppDrawer"
            : "Login"
        }
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="MainAppDrawer" component={MainAppDrawer} />
        <Stack.Screen
          name="MainAppDrawerConductor"
          component={MainAppDrawerConductor}
        />
      </Stack.Navigator>
      <FlashMessage
        position="top"
        floating={true}
        statusBarHeight={StatusBar.currentHeight}
        style={{ marginTop: Platform.OS === 'android' ? 30 : 0 }}
        titleStyle={{ paddingTop: 5 }}
      />
    </NavigationContainer>
  );
}

import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar, Platform } from 'react-native';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppLayout />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

// Update AppLayout's FlashMessage:
// We add extra padding and specific style to ensure it looks good.
// floating={true} should make it a bubble, but if it fails, the style fixes the padding.

