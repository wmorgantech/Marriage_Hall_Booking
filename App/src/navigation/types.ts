import type { NavigatorScreenParams } from '@react-navigation/native';
import type { AiSearchResponse, Booking } from '../api/types';

export type ExploreStackParamList = {
  Home: undefined;
  AiSearch: undefined;
  AiResults: { result: AiSearchResponse };
  HallDetail: { hallId: string };
  CheckAvailability: { hallId: string };
  BookingForm: undefined;
  BookingSummary: undefined;
  Payment: undefined;
  BookingConfirmation: { booking: Booking };
};

export type AccountStackParamList = {
  OwnerLogin: undefined;
  OwnerRegister: undefined;
  OwnerDashboard: undefined;
  UserProfile: undefined;
};

export type RootTabParamList = {
  ExploreTab: NavigatorScreenParams<ExploreStackParamList>;
  FavoritesTab: undefined;
  BookingsTab: undefined;
  AccountTab: NavigatorScreenParams<AccountStackParamList>;
};
