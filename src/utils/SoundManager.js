import { Audio } from 'expo-av';
import { Vibration } from 'react-native';

class SoundManager {
    static soundObject = null;

    static async playErrorSound() {
        try {
            // FALTA EL ARCHIVO DE SONIDO:
            // 1. Agrega un archivo llamado "error.mp3" en la carpeta assets/
            // 2. Descomenta las lineas siguientes para activar el sonido

            /*
            const { sound } = await Audio.Sound.createAsync(
                require('../../assets/error.mp3')
            );

            this.soundObject = sound;
            await sound.playAsync();

            // Limpiar memoria al terminar
            sound.setOnPlaybackStatusUpdate(async (status) => {
                if (status.didJustFinish) {
                    await sound.unloadAsync();
                }
            });
            */

            // Por ahora, usamos vibración como fallback garantizado
            Vibration.vibrate([0, 500]);

        } catch (error) {
            console.log('Error playing sound, falling back to vibration', error);
            // Fallback a vibración si no hay sonido o falla
            Vibration.vibrate([0, 500]);
        }
    }
}

export default SoundManager;
