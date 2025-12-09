import { type ToastActionElement, type ToastProps } from "../components/ui/toast"
import {
  useToast as useToastPrimitive,
} from "../components/ui/use-toast"

type ToastOptions = Omit<ToastProps, "id" | "title" | "description" | "action"> & {
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
}

export const useToast = () => {
  const { toast, ...rest } = useToastPrimitive()

  return {
    ...rest,
    toast: (props: ToastOptions) => {
      const { title, description, variant, action, ...options } = props

      return toast({
        title,
        description,
        variant,
        action,
        ...options,
      })
    },
  }
}