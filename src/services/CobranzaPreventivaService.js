import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

const API_URL = 'https://98.94.185.164.nip.io/api/pagina/facturas-segmento';

/**
 * Formats a number to currency string
 */
const formatCurrency = (value) => {
    if (value === undefined || value === null) return '0,00';
    return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
};

/**
 * Formats a date string to DD/MM/YYYY
 */
const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;

        // Si la cadena contiene 'T' o 'Z', es probable que sea una fecha ISO UTC
        // Extraemos los componentes UTC para evitar el desplazamiento por zona horaria local
        if (dateStr.includes('T') || dateStr.includes('Z')) {
            const day = String(date.getUTCDate()).padStart(2, '0');
            const month = String(date.getUTCMonth() + 1).padStart(2, '0');
            const year = date.getUTCFullYear();
            return `${day}/${month}/${year}`;
        }

        // Para formatos como "YYYY-MM-DD HH:mm:ss" sin zona horaria, tomamos los componentes locales
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    } catch (e) {
        return dateStr;
    }
};

export const generateCobranzaPDF = async (user, discountPercent = 0) => {
    if (!user || !user.co_ven) {
        throw new Error('No se encontró el código de vendedor.');
    }

    const discountFactor = 1 - (parseFloat(discountPercent) || 0) / 100;

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                co_ven: user.co_ven,
                todos: true,
            }),
        });

        if (!response.ok) {
            throw new Error(`Error del servidor: ${response.status}`);
        }

        const data = await response.json();

        // Use data.data if it exists, otherwise just data if it's already the array
        const invoices = Array.isArray(data) ? data : (data.data || []);

        if (invoices.length === 0) {
            throw new Error('No se encontraron facturas para este vendedor.');
        }

        const htmlContent = `
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Cobranza Preventiva</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        font-size: 8px;
                        margin: 0;
                        padding: 10px;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 10px;
                    }
                    th {
                        background-color: #1A9888;
                        color: white;
                        text-align: center;
                        padding: 5px;
                        border: 1px solid #147A6D;
                        font-weight: bold;
                    }
                    td {
                        border: 1px solid #ddd;
                        padding: 4px;
                        text-align: center;
                        vertical-align: middle;
                    }
                    .text-left { text-align: left; }
                    .bg-blue { background-color: #E3F2FD; }
                    .bg-pink { background-color: #F8D7DA; }
                    .bg-green-light { background-color: #D1E7DD; }
                    
                    .header-info {
                        display: flex;
                        justify-content: space-between;
                        margin-bottom: 20px;
                        font-size: 12px;
                    }
                    .title {
                        font-size: 18px;
                        font-weight: bold;
                        color: #1A9888;
                        text-align: center;
                        margin-bottom: 5px;
                    }
                    .subtitle {
                        text-align: center;
                        margin-bottom: 15px;
                        font-size: 10px;
                        color: #666;
                    }
                </style>
            </head>
            <body>
                <div class="title">REPORTE COBRANZA PREVENTIVA</div>
                <div class="subtitle">Vendedor: ${user.nombre || user.co_ven} | Fecha: ${new Date().toLocaleDateString('es-VE')} | Dscto. Divisas: ${discountPercent}%</div>

                <table>
                    <thead>
                        <tr>
                            <th>Codigo</th>
                            <th>Descripción</th>
                            <th>Nº Factura</th>
                            <th>Emision</th>
                            <th style="background-color: #3498DB;">Escaneada</th>
                            <th>Vencimiento</th>
                            <th>Tipo</th>
                            <th>Total neto</th>
                            <th>Saldo sin descuento</th>
                            <th>Saldo con descuento</th>
                            <th style="background-color: #E74C3C;">Mora</th>
                            <th style="background-color: #49AF4E;">Retencion $</th>
                            <th style="background-color: #49AF4E;">Retencion Bs</th>
                            <th>Desc</th>
                            <th>Monto $</th>
                            <th>HOY Bs</th>
                            <th>Pago dolar</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${invoices.map(fact => {
            const discountedMontoDolar = (fact.monto_dolar || 0) * discountFactor;
            return `
                            <tr>
                                <td>${fact.co_cli || ''}</td>
                                <td class="text-left">${fact.cli_des || ''}</td>
                                <td>${fact.fact_num || ''}</td>
                                <td>${formatDate(fact.emision)}</td>
                                <td class="bg-blue">${formatDate(fact.fecha_escaneo)}</td>
                                <td>${formatDate(fact.vence)}</td>
                                <td>${fact.tipo || 0}</td>
                                <td>${formatCurrency(fact.tot_neto)}</td>
                                <td>${formatCurrency(fact.saldo)}</td>
                                <td>${formatCurrency(fact.saldo_con_descuento)}</td>
                                <td class="bg-pink">${fact.mora || 0}</td>
                                <td class="bg-green-light">${formatCurrency(fact.retencion_dolar)}</td>
                                <td class="bg-green-light">${formatCurrency(fact.retencion)}</td>
                                <td>${fact.descuento || 0}%</td>
                                <td>${formatCurrency(fact.monto_dolar)}</td>
                                <td>${formatCurrency(fact.monto_bs)}</td>
                                <td>${formatCurrency(discountedMontoDolar)}</td>
                            </tr>
                            `;
        }).join('')}
                    </tbody>
                </table>
            </body>
            </html>
        `;

        const { uri } = await Print.printToFileAsync({ html: htmlContent });

        if (Platform.OS === 'ios') {
            await Sharing.shareAsync(uri);
        } else {
            await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
        }

        return { success: true };

    } catch (error) {
        console.error('PDF Generation Error:', error);
        throw error;
    }
};
