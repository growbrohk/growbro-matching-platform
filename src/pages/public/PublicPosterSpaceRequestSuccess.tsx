import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle } from 'lucide-react';

export default function PublicPosterSpaceRequestSuccess() {
  const { spaceParam, requestId } = useParams<{
    spaceParam: string;
    requestId: string;
  }>();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FBF8F4' }}>
      <Card className="max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <CheckCircle className="h-16 w-16 text-green-500" />
          </div>
          <CardTitle>Request Sent</CardTitle>
          <CardDescription>Your booking request has been submitted successfully</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center text-sm text-muted-foreground">
            <p>Request ID: {requestId}</p>
            <p className="mt-2">The space owner will review your request and get back to you soon.</p>
          </div>
          <div className="flex gap-2">
            {spaceParam && (
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => navigate(`/space/${spaceParam}`)}
              >
                Back to Space
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

