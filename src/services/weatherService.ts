import { API_BASE_URL } from '@/config';

const WEATHER_CITY_STORAGE_KEY = 'visual_app_weather_default_city';

export const weatherService = {
    async getConfig(): Promise<{ defaultCity: string }> {
        const localDefaultCity = localStorage.getItem(WEATHER_CITY_STORAGE_KEY)?.trim();
        if (localDefaultCity) {
            return { defaultCity: localDefaultCity };
        }

        const response = await fetch(`${API_BASE_URL}/weather/config`);
        if (!response.ok) {
            throw new Error('Failed to fetch weather config');
        }
        return response.json();
    },

    setDefaultCity(defaultCity: string): void {
        const city = defaultCity.trim();
        if (city) {
            localStorage.setItem(WEATHER_CITY_STORAGE_KEY, city);
        }
    },

    clearDefaultCity(): void {
        localStorage.removeItem(WEATHER_CITY_STORAGE_KEY);
    }
};
