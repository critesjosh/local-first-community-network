import React from 'react';
import {View, Text, StyleSheet, Image, TouchableOpacity} from 'react-native';
import {Event} from '../../types/models';

interface EventCardProps {
  event: Event;
  onPress?: () => void;
  onRSVP?: (eventId: string, status: 'going' | 'interested' | 'not_going') => void;
  currentUserRSVP?: 'going' | 'interested' | 'not_going';
  attendeeCount?: number;
}

const EventCard: React.FC<EventCardProps> = ({
  event,
  onPress,
  onRSVP,
  currentUserRSVP,
  attendeeCount = 0,
}) => {
  const formatDateTime = (date: Date): string => {
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatTimeAgo = (date: Date): string => {
    const now = new Date();
    const eventDate = new Date(date);
    const diffInMs = now.getTime() - eventDate.getTime();
    const diffInMinutes = Math.floor(diffInMs / 60000);
    const diffInHours = Math.floor(diffInMinutes / 60);
    const diffInDays = Math.floor(diffInHours / 24);

    if (diffInMinutes < 1) {
      return 'just now';
    } else if (diffInMinutes < 60) {
      return `${diffInMinutes}m ago`;
    } else if (diffInHours < 24) {
      return `${diffInHours}h ago`;
    } else {
      return `${diffInDays}d ago`;
    }
  };

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={!onPress}>
      {event.photo && (
        <Image
          source={{uri: `data:image/jpeg;base64,${event.photo}`}}
          style={styles.photo}
        />
      )}

      <View style={styles.content}>
        <Text style={styles.title}>{event.title}</Text>

        <View style={styles.dateTimeContainer}>
          <Text style={styles.dateTime}>{formatDateTime(event.datetime)}</Text>
        </View>

        {event.location && (
          <View style={styles.locationContainer}>
            <Text style={styles.locationIcon}>📍</Text>
            <Text style={styles.location}>{event.location}</Text>
          </View>
        )}

        {event.description && (
          <Text style={styles.description} numberOfLines={3}>
            {event.description}
          </Text>
        )}

        <View style={styles.footer}>
          <Text style={styles.postedTime}>
            Posted {formatTimeAgo(event.createdAt)}
          </Text>

          {attendeeCount > 0 && (
            <View style={styles.attendeeCount}>
              <Text style={styles.attendeeCountText}>
                {attendeeCount} {attendeeCount === 1 ? 'person' : 'people'} going
              </Text>
            </View>
          )}
        </View>

        {onRSVP && (
          <View style={styles.rsvpContainer}>
            <TouchableOpacity
              style={[
                styles.rsvpButton,
                currentUserRSVP === 'going' && styles.rsvpButtonActive,
              ]}
              onPress={() => onRSVP(event.id, 'going')}>
              <Text
                style={[
                  styles.rsvpButtonText,
                  currentUserRSVP === 'going' && styles.rsvpButtonTextActive,
                ]}>
                I'm Going
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.rsvpButton,
                styles.rsvpButtonSecondary,
                currentUserRSVP === 'interested' && styles.rsvpButtonActive,
              ]}
              onPress={() => onRSVP(event.id, 'interested')}>
              <Text
                style={[
                  styles.rsvpButtonText,
                  currentUserRSVP === 'interested' && styles.rsvpButtonTextActive,
                ]}>
                Interested
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  photo: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#000',
  },
  dateTimeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  dateTime: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  locationIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  location: {
    fontSize: 14,
    color: '#8E8E93',
    flex: 1,
  },
  description: {
    fontSize: 15,
    color: '#3C3C43',
    marginBottom: 12,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  postedTime: {
    fontSize: 12,
    color: '#8E8E93',
  },
  attendeeCount: {
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  attendeeCountText: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '600',
  },
  rsvpContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  rsvpButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
    backgroundColor: 'white',
    alignItems: 'center',
  },
  rsvpButtonSecondary: {
    borderColor: '#8E8E93',
  },
  rsvpButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  rsvpButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  rsvpButtonTextActive: {
    color: 'white',
  },
});

export default EventCard;
