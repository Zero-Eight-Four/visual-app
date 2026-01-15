import { API_BASE_URL } from '@/config';

export const weatherService = {
    async getConfig(): Promise<{ defaultCity: string }> {
        const response = await fetch(`${API_BASE_URL}/weather/config`);
        if (!response.ok) {
            throw new Error('Failed to fetch weather config');
        }
        return response.json();
    },

    async updateConfig(defaultCity: string): Promise<void> {
        const response = await fetch(`${API_BASE_URL}/weather/config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ defaultCity })
        });
        if (!response.ok) {
            throw new Error('Failed to update weather config');
        }
    }
};
