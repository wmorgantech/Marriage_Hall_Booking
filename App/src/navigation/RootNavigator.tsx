import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, View, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import HomeScreen from '../screens/HomeScreen';
import AiSearchScreen from '../screens/AiSearchScreen';
import AiResultsScreen from '../screens/AiResultsScreen';
import HallDetailScreen from '../screens/HallDetailScreen';
import CheckAvailabilityScreen from '../screens/CheckAvailabilityScreen';
import BookingFormScreen from '../screens/BookingFormScreen';
import BookingSummaryScreen from '../screens/BookingSummaryScreen';
import PaymentScreen from '../screens/PaymentScreen';
import BookingConfirmationScreen from '../screens/BookingConfirmationScreen';
import FavoritesListScreen from '../screens/FavoritesListScreen';
import BookingHistoryScreen from '../screens/BookingHistoryScreen';
import OwnerLoginScreen from '../screens/OwnerLoginScreen';
import OwnerRegisterScreen from '../screens/OwnerRegisterScreen';
import OwnerDashboardScreen from '../screens/OwnerDashboardScreen';
import UserProfileScreen from '../screens/UserProfileScreen';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { BookingDraftProvider } from '../booking/BookingDraftContext';
import { colors } from '../theme/colors';
import type { AccountStackParamList, ExploreStackParamList, RootTabParamList } from './types';

const ExploreStack = createNativeStackNavigator<ExploreStackParamList>();
const AccountStack = createNativeStackNavigator<AccountStackParamList>();
const Tab = createBottomTabNavigator<RootTabParamList>();

function ExploreStackNavigator() {
  return (
    <BookingDraftProvider>
      <ExploreStack.Navigator screenOptions={{ headerShown: false }}>
        <ExploreStack.Screen name="Home" component={HomeScreen} />
        <ExploreStack.Screen name="AiSearch" component={AiSearchScreen} />
        <ExploreStack.Screen name="AiResults" component={AiResultsScreen} />
        <ExploreStack.Screen name="HallDetail" component={HallDetailScreen} />
        <ExploreStack.Screen name="CheckAvailability" component={CheckAvailabilityScreen} />
        <ExploreStack.Screen name="BookingForm" component={BookingFormScreen} />
        <ExploreStack.Screen name="BookingSummary" component={BookingSummaryScreen} />
        <ExploreStack.Screen name="Payment" component={PaymentScreen} />
        <ExploreStack.Screen name="BookingConfirmation" component={BookingConfirmationScreen} />
      </ExploreStack.Navigator>
    </BookingDraftProvider>
  );
}

function AccountStackNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const initialRoute =
    user?.role === 'OWNER' ? 'OwnerDashboard' : user?.role === 'USER' ? 'UserProfile' : 'OwnerLogin';

  return (
    <AccountStack.Navigator screenOptions={{ headerShown: false }} initialRouteName={initialRoute}>
      <AccountStack.Screen name="OwnerLogin" component={OwnerLoginScreen} />
      <AccountStack.Screen name="OwnerRegister" component={OwnerRegisterScreen} />
      <AccountStack.Screen name="OwnerDashboard" component={OwnerDashboardScreen} />
      <AccountStack.Screen name="UserProfile" component={UserProfileScreen} />
    </AccountStack.Navigator>
  );
}

/** Animated top-pill tab icon with active indicator */
function TabIcon({
  iconName,
  focused,
  color,
  badgeCount,
}: {
  iconName: keyof typeof MaterialIcons.glyphMap;
  focused: boolean;
  color: string;
  badgeCount?: number;
}) {
  const pillWidth = useRef(new Animated.Value(focused ? 28 : 0)).current;

  useEffect(() => {
    Animated.spring(pillWidth, {
      toValue: focused ? 28 : 0,
      friction: 7,
      tension: 50,
      useNativeDriver: false,
    }).start();
  }, [focused, pillWidth]);

  return (
    <View style={{ alignItems: 'center', paddingTop: 4 }}>
      {/* Top pill indicator */}
      <Animated.View
        style={{
          height: 3,
          width: pillWidth,
          backgroundColor: colors.primary,
          borderRadius: 1.5,
          marginBottom: 5,
        }}
      />
      <View style={{ position: 'relative' }}>
        <MaterialIcons name={iconName} size={22} color={color} />
        {/* Badge */}
        {badgeCount != null && badgeCount > 0 && (
          <View
            style={{
              position: 'absolute',
              top: -4,
              right: -8,
              backgroundColor: colors.primary,
              borderRadius: 8,
              minWidth: 16,
              height: 16,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 3,
            }}
          >
            <Text style={{ fontSize: 9, fontWeight: '700', color: '#fff', lineHeight: 16 }}>
              {badgeCount > 9 ? '9+' : badgeCount}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

export function RootNavigator() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [bookingCount, setBookingCount] = useState(0);

  function refreshBookingCount() {
    if (!user) { setBookingCount(0); return; }
    api.getMyBookings().then((b) => setBookingCount(b.length)).catch(() => {});
  }

  useEffect(() => {
    refreshBookingCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.outline,
          tabBarStyle: {
            borderTopColor: 'rgba(198,154,69,0.3)',
            borderTopWidth: 1,
            // Numeric heights suppress the library's own insets.bottom handling
            // (verified against @react-navigation/bottom-tabs source), so the
            // safe-area/gesture-nav inset is added in explicitly here instead.
            height: 56 + insets.bottom,
            paddingBottom: Math.max(insets.bottom, 6),
            paddingTop: 0,
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '600',
            letterSpacing: 0.2,
            marginTop: 0,
          },
          tabBarIcon: ({ color, focused }) => {
            const name = route.name as keyof RootTabParamList;
            const icon: keyof typeof MaterialIcons.glyphMap =
              name === 'ExploreTab'   ? 'search'         :
              name === 'FavoritesTab' ? (focused ? 'favorite' : 'favorite-border') :
              name === 'BookingsTab'  ? 'calendar-month' : 'person';
            const badge = name === 'BookingsTab' ? bookingCount : undefined;
            return <TabIcon iconName={icon} focused={focused} color={color} badgeCount={badge} />;
          },
        })}
      >
        <Tab.Screen name="ExploreTab"   component={ExploreStackNavigator} options={{ title: 'Explore' }} />
        <Tab.Screen name="FavoritesTab" component={FavoritesListScreen}   options={{ title: 'Saved' }} />
        <Tab.Screen
          name="BookingsTab"
          component={BookingHistoryScreen}
          options={{ title: 'Bookings' }}
          listeners={{
            tabPress: () => {
              // Refresh badge when user visits Bookings tab
              refreshBookingCount();
            },
          }}
        />
        <Tab.Screen name="AccountTab"   component={AccountStackNavigator} options={{ title: 'Account' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
