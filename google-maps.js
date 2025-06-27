import { Client } from '@googlemaps/google-maps-services-js';

export class GoogleMapsService {
  constructor(apiKey) {
    this.client = new Client({});
    this.apiKey = apiKey;
  }

  async calculateRoute({ origin, destination, waypoints = [], ...options }) {
    try {
      const params = {
        params: {
          origin,
          destination,
          key: this.apiKey,
          units: 'metric',
          departure_time: options.departureTime === 'now' ? 'now' : options.departureTime,
          traffic_model: options.trafficModel || 'best_guess',
          alternatives: options.alternatives !== false
        }
      };

      // Add waypoints if provided
      if (waypoints.length > 0) {
        params.params.waypoints = waypoints.join('|');
      }

      // Handle avoid options
      const avoidOptions = [];
      if (options.avoidTolls) avoidOptions.push('tolls');
      if (options.avoidHighways) avoidOptions.push('highways');
      if (avoidOptions.length > 0) {
        params.params.avoid = avoidOptions.join('|');
      }

      console.log('🗺️ Google Maps API request:', JSON.stringify(params.params, null, 2));
      
      const response = await this.client.directions(params);
      
      if (!response.data.routes || response.data.routes.length === 0) {
        throw new Error('No route found between the specified locations');
      }

      const route = response.data.routes[0];
      const leg = route.legs[0];
      
      // Extract turn-by-turn directions
      const steps = leg.steps.map((step, index) => ({
        stepNumber: index + 1,
        instruction: step.html_instructions.replace(/<[^>]*>/g, ''), // Strip HTML tags
        distance: step.distance.text,
        duration: step.duration.text,
        maneuver: step.maneuver || 'continue'
      }));

      const result = {
        summary: route.summary,
        distance: leg.distance.value, // in meters
        duration: leg.duration.value, // in seconds
        durationInTraffic: leg.duration_in_traffic?.value || leg.duration.value,
        steps: steps,
        polyline: route.overview_polyline.points,
        warnings: route.warnings || [],
        copyrights: route.copyrights
      };

      console.log(`✅ Route calculated: ${result.distance}m, ${result.duration}s`);
      return result;

    } catch (error) {
      console.error('❌ Google Maps API error:', error.response?.data || error.message);
      
      // Provide more helpful error messages
      if (error.response?.data?.error_message) {
        throw new Error(`Google Maps API: ${error.response.data.error_message}`);
      } else if (error.response?.data?.status === 'ZERO_RESULTS') {
        throw new Error('No route found. Please check that your origin and destination are valid locations.');
      } else if (error.response?.data?.status === 'NOT_FOUND') {
        throw new Error('One or more locations could not be found. Please check your addresses.');
      } else if (error.response?.data?.status === 'OVER_QUERY_LIMIT') {
        throw new Error('Google Maps API quota exceeded. Please try again later.');
      } else if (error.response?.data?.status === 'REQUEST_DENIED') {
        throw new Error('Google Maps API request denied. Please check API key configuration.');
      } else {
        throw new Error(`Route calculation failed: ${error.message}`);
      }
    }
  }

  async getTrafficInfo({ origin, destination, departureTime = 'now' }) {
    try {
      // Use the same calculateRoute method but with traffic focus
      const route = await this.calculateRoute({ 
        origin, 
        destination, 
        departureTime,
        trafficModel: 'best_guess'
      });
      
      return {
        ...route,
        route: {
          summary: route.summary,
          distance: route.distance
        }
      };
    } catch (error) {
      throw new Error(`Traffic info retrieval failed: ${error.message}`);
    }
  }

  async geocode(address) {
    try {
      const response = await this.client.geocode({
        params: {
          address,
          key: this.apiKey
        }
      });

      if (!response.data.results || response.data.results.length === 0) {
        throw new Error(`Location not found: ${address}`);
      }

      const result = response.data.results[0];
      return {
        address: result.formatted_address,
        location: result.geometry.location,
        placeId: result.place_id
      };
    } catch (error) {
      console.error('❌ Geocoding error:', error.message);
      throw new Error(`Geocoding failed: ${error.message}`);
    }
  }
}