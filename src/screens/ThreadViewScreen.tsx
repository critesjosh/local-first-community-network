import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import ThreadService from '../services/ThreadService';
import ConnectionService from '../services/ConnectionService';
import {ThreadReply, Connection} from '../types/models';
import ThreadReplyCard from '../components/threads/ThreadReplyCard';
import ReplyComposer from '../components/threads/ReplyComposer';

type RootStackParamList = {
  ThreadView: {threadId: string; postContent?: string; postAuthor?: string};
};

type Props = NativeStackScreenProps<RootStackParamList, 'ThreadView'>;

const ThreadViewScreen: React.FC<Props> = ({route, navigation}) => {
  const {threadId, postContent, postAuthor} = route.params;
  const [replies, setReplies] = useState<ThreadReply[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [composerVisible, setComposerVisible] = useState(false);

  const loadReplies = useCallback(async () => {
    try {
      console.log('[ThreadViewScreen] Loading replies for thread:', threadId);
      const {replies: threadReplies} = await ThreadService.getThreadWithReplies(threadId);
      setReplies(threadReplies);
      console.log(`[ThreadViewScreen] Loaded ${threadReplies.length} replies`);
    } catch (error) {
      console.error('[ThreadViewScreen] Error loading replies:', error);
      // Don't show error alert, just log it
    }
  }, [threadId]);

  const loadConnections = useCallback(async () => {
    try {
      const conns = await ConnectionService.getConnections();
      setConnections(conns);
    } catch (error) {
      console.error('[ThreadViewScreen] Error loading connections:', error);
    }
  }, []);

  const initialize = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadReplies(), loadConnections()]);
    setLoading(false);
  }, [loadReplies, loadConnections]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadReplies();
    setRefreshing(false);
  }, [loadReplies]);

  const handlePostReply = useCallback(
    async (content: string) => {
      try {
        console.log('[ThreadViewScreen] Posting reply to thread:', threadId);
        await ThreadService.postReply(threadId, content);
        await loadReplies();
      } catch (error) {
        console.error('[ThreadViewScreen] Error posting reply:', error);
        throw error;
      }
    },
    [threadId, loadReplies],
  );

  useEffect(() => {
    initialize();
  }, [initialize]);

  const getAuthorName = (authorId: string): string => {
    const connection = connections.find(c => c.userId === authorId);
    return connection?.displayName || 'Unknown';
  };

  const getAuthorPhoto = (authorId: string): string | undefined => {
    const connection = connections.find(c => c.userId === authorId);
    return connection?.profilePhoto;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading thread...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }>
        {/* Original Post */}
        <View style={styles.originalPost}>
          <View style={styles.originalPostHeader}>
            <Text style={styles.originalPostLabel}>Original Post</Text>
            {postAuthor && <Text style={styles.originalPostAuthor}>by {postAuthor}</Text>}
          </View>
          {postContent && <Text style={styles.originalPostContent}>{postContent}</Text>}
        </View>

        {/* Replies Section */}
        <View style={styles.repliesSection}>
          <Text style={styles.repliesHeader}>
            {replies.length} {replies.length === 1 ? 'Reply' : 'Replies'}
          </Text>

          {replies.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No replies yet</Text>
              <Text style={styles.emptyStateSubtext}>Be the first to reply!</Text>
            </View>
          ) : (
            replies.map(reply => (
              <ThreadReplyCard
                key={reply.id}
                reply={reply}
                authorName={getAuthorName(reply.authorId)}
                authorPhoto={getAuthorPhoto(reply.authorId)}
              />
            ))
          )}
        </View>
      </ScrollView>

      {/* Reply Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.replyButton}
          onPress={() => setComposerVisible(true)}>
          <Text style={styles.replyButtonText}>Reply to Thread</Text>
        </TouchableOpacity>
      </View>

      {/* Reply Composer Modal */}
      <ReplyComposer
        visible={composerVisible}
        onClose={() => setComposerVisible(false)}
        onSubmit={handlePostReply}
        threadId={threadId}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#8E8E93',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 80,
  },
  originalPost: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  originalPostHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  originalPostLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#007AFF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  originalPostAuthor: {
    fontSize: 12,
    color: '#8E8E93',
  },
  originalPostContent: {
    fontSize: 16,
    color: '#000',
    lineHeight: 22,
  },
  repliesSection: {
    marginBottom: 16,
  },
  repliesHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 4,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#C7C7CC',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: -2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  replyButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  replyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});

export default ThreadViewScreen;
